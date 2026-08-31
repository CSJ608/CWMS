package com.cwms.pda

import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * CWMS PDA 会话屏:扫码工作流(收货上架/拣货出库)+ 会话历史,纯消费 CWMS /api。
 * 扫码优先 / 工业反馈 / 加载互斥,见 pda-scan-universal 技能六支柱。
 */
class MainActivity : AppCompatActivity() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var pollRunnable: Runnable? = null

    private lateinit var spinner: Spinner
    private lateinit var editScan: EditText
    private lateinit var txtStep: TextView
    private lateinit var txtExpect: TextView
    private lateinit var txtOutcome: TextView
    private lateinit var txtError: TextView
    private lateinit var boxCollected: LinearLayout
    private lateinit var boxHistory: LinearLayout

    private val wfTitles = linkedMapOf<String, String>() // id -> title,保持服务端顺序
    private var activeSession: JSONObject? = null

    @Volatile private var inflight = false // 加载互斥:请求在途时忽略扫码/提交(双通道同触发兜底)

    // ---- 扫码广播通道(设置页 action 非空时启用;空 = 键盘模式) ----
    private val scanReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            decodeScan(intent)?.let { runOnUiThread { onScanArrived(it) } }
        }
    }

    /** 厂商 extra 键不一:主键可配不可行则兜底遍历;byte[] 须 UTF-8 解码(实测事实)。 */
    private fun decodeScan(intent: Intent): String? {
        val extras = intent.extras ?: return null
        for (key in SCAN_KEYS) {
            extras.getByteArray(key)?.let { return String(it, Charsets.UTF_8) }
            extras.getString(key)?.let { return it }
        }
        return null
    }

    override fun onStart() {
        super.onStart()
        val action = Prefs.scanAction(this)
        if (action.isNotEmpty()) {
            ContextCompat.registerReceiver(
                this, scanReceiver, IntentFilter(action), ContextCompat.RECEIVER_EXPORTED,
            )
        }
    }

    override fun onStop() {
        super.onStop()
        runCatching { unregisterReceiver(scanReceiver) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        spinner = findViewById(R.id.spinnerWorkflow)
        editScan = findViewById(R.id.editScan)
        txtStep = findViewById(R.id.txtStep)
        txtExpect = findViewById(R.id.txtExpect)
        txtOutcome = findViewById(R.id.txtOutcome)
        txtError = findViewById(R.id.txtError)
        boxCollected = findViewById(R.id.boxCollected)
        boxHistory = findViewById(R.id.boxHistory)

        findViewById<Button>(R.id.btnSettings).setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
        findViewById<Button>(R.id.btnStart).setOnClickListener { startSession() }
        findViewById<Button>(R.id.btnSubmit).setOnClickListener { submitFromField() }

        // 扫码框:无 IME(枪的键盘楔事件仍可进入);回车在 ACTION_UP 提交并消费,防焦点跳走
        editScan.showSoftInputOnFocus = false
        editScan.setOnKeyListener { _, keyCode, event ->
            if (keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_TAB) {
                if (event.action == KeyEvent.ACTION_UP) submitFromField()
                true
            } else false
        }
        renderSession()
    }

    override fun onResume() {
        super.onResume()
        refreshState(loud = false)
        editScan.requestFocus()
        startPolling()
    }

    override fun onPause() {
        super.onPause()
        stopPolling()
    }

    // ---- 轮询:历史与活动会话跟随服务端状态(轮询错误静默,不打断作业) ----
    private fun startPolling() {
        stopPolling()
        val r = Runnable {
            refreshState(loud = false)
            startPolling()
        }
        pollRunnable = r
        mainHandler.postDelayed(r, 2000)
    }

    private fun stopPolling() {
        pollRunnable?.let { mainHandler.removeCallbacks(it) }
        pollRunnable = null
    }

    // ---- 状态刷新 ----
    private fun refreshState(loud: Boolean) {
        Api.get(Prefs.server(this), "/api/state") { ok, json, error ->
            if (!ok) {
                if (loud) showError(error)
                return@get
            }
            val pda = json?.optJSONObject("pda") ?: return@get
            syncWorkflows(pda.optJSONArray("workflows") ?: JSONArray())
            renderHistory(pda.optJSONArray("sessions") ?: JSONArray())
            syncActiveFromServer(pda.optJSONArray("sessions") ?: JSONArray())
        }
    }

    private fun syncWorkflows(workflows: JSONArray) {
        if (wfTitles.isNotEmpty()) return // 列表只在冷启动拉一次,轮询不重置用户选择
        for (i in 0 until workflows.length()) {
            val w = workflows.optJSONObject(i) ?: continue
            wfTitles[w.optString("id")] = w.optString("title")
        }
        spinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, wfTitles.values.toList()).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }
    }

    /** 服务端是会话真相源:活动会话被外部(如 PC)终结时,本地视图跟随。 */
    private fun syncActiveFromServer(sessions: JSONArray) {
        val id = activeSession?.optString("id") ?: return
        val snap = (0 until sessions.length()).asSequence()
            .map { sessions.optJSONObject(it) }.firstOrNull { it?.optString("id") == id }
        if (snap == null) {
            activeSession = null
            renderSession()
        } else if (snap.optString("status") != "running" && activeSession?.optString("status") == "running") {
            activeSession = snap
            renderSession()
        }
    }

    // ---- 会话操作 ----
    private fun startSession() {
        if (inflight) return // 加载互斥:防「开始会话」连点双开会话
        val wfId = wfTitles.keys.toList().getOrNull(spinner.selectedItemPosition) ?: return
        inflight = true
        Api.post(Prefs.server(this), "/api/pda/start", JSONObject().put("workflowId", wfId)) { ok, json, error ->
            inflight = false
            if (!ok) { showError(error); return@post }
            if (json?.optBoolean("ok") == false) { showError(json.optString("error")); return@post }
            activeSession = json?.optJSONObject("result")
            txtError.visibility = View.GONE
            editScan.setText("")
            editScan.requestFocus()
            renderSession()
        }
    }

    private fun onScanArrived(text: String) {
        editScan.setText(text)
        submitFromField()
    }

    private fun submitFromField() {
        val raw = editScan.text.toString().trim()
        val snap = activeSession?.takeIf { it.optString("status") == "running" }
            ?: run { showError(getString(R.string.no_session)); return }
        val expectsQty = snap.optJSONObject("prompt")?.optString("expects") == "input"
        if (!expectsQty && raw.isEmpty()) return
        val value: Any = if (expectsQty) (raw.toIntOrNull()?.takeIf { it > 0 } ?: run {
            showError("数量须为正整数"); return
        }) else raw
        submitValue(snap.optString("id"), value)
    }

    private fun submitValue(sessionId: String, value: Any) {
        if (inflight) return // 加载互斥
        inflight = true
        val body = JSONObject().put("sessionId", sessionId).put("value", value)
        Api.post(Prefs.server(this), "/api/pda/submit", body) { ok, json, error ->
            inflight = false
            if (!ok) { showError(error); return@post }
            if (json?.optBoolean("ok") == false) { showError(json.optString("error")); return@post }
            val snap = json?.optJSONObject("result") ?: return@post
            activeSession = snap
            txtError.visibility = View.GONE
            editScan.setText("")
            renderSession()
            refreshState(loud = false) // 立即拉一次历史,不等下一轮询
        }
    }

    // ---- 呈现 ----
    private fun renderSession() {
        val snap = activeSession
        if (snap == null) {
            txtStep.text = getString(R.string.no_session)
            txtExpect.visibility = View.GONE
            txtOutcome.visibility = View.GONE
            boxCollected.removeAllViews()
            return
        }
        val p = snap.optJSONObject("prompt")
        if (p != null) {
            txtStep.text = "${p.optInt("index")}/${p.optInt("total")} · ${p.optString("action")}"
            val waiting = when (p.optString("expects")) {
                "input" -> "等待键盘输入"
                "scan" -> "等待扫码"
                else -> "等待确认"
            }
            txtExpect.text = waiting
            txtExpect.visibility = View.VISIBLE
        } else {
            txtStep.text = "会话已结束"
            txtExpect.visibility = View.GONE
        }

        val o = snap.optJSONObject("outcome")
        if (o != null) {
            txtOutcome.visibility = View.VISIBLE
            if (o.optBoolean("blocked") == false) {
                txtOutcome.text = "✔ ${nounOf(snap)}成功 → ${o.optString("location", "")}"
                txtOutcome.setTextColor(Color.parseColor("#35C48D"))
                Buzz.ok(this)
            } else {
                txtOutcome.text = "✘ ${o.optString("reason", "被拒绝")}"
                txtOutcome.setTextColor(Color.parseColor("#FF6B6B"))
                Buzz.err(this)
            }
        } else {
            txtOutcome.visibility = View.GONE
        }

        boxCollected.removeAllViews()
        val collected = snap.optJSONObject("collected")
        if (collected != null && collected.length() > 0) {
            for (key in collected.keys()) collectedRow("$key = ${collected.opt(key)}")
        }
    }

    private fun nounOf(snap: JSONObject): String =
        if (snap.optString("workflowId") == "outbound-pick") "出库" else "上架"

    @SuppressLint("SetTextI18n")
    private fun collectedRow(text: String) {
        val tv = TextView(this).apply {
            this.text = text
            textSize = 14f
            setTextColor(Color.parseColor("#8EA0C0"))
            typeface = android.graphics.Typeface.MONOSPACE
            setPadding(0, 4, 0, 4)
        }
        boxCollected.addView(tv)
    }

    private fun renderHistory(sessions: JSONArray) {
        boxHistory.removeAllViews()
        val done = (0 until sessions.length()).asSequence()
            .map { sessions.optJSONObject(it) }
            .filter { it?.optString("status") == "completed" }
            .toList()
            .takeLast(6)
            .reversed()
        if (done.isEmpty()) {
            boxHistory.addView(TextView(this).apply {
                text = getString(R.string.no_history)
                textSize = 13f
                setTextColor(Color.parseColor("#55648A"))
                setPadding(0, 8, 0, 8)
            })
            return
        }
        for (snap in done) historyRow(snap ?: continue)
    }

    /** 历史行:结局徽章(成功绿/失败红)+ 工作流 + 任务 id + 结局与采集摘要。 */
    private fun historyRow(snap: JSONObject) {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 6, 0, 6)
        }
        val ok = snap.optJSONObject("outcome")?.optBoolean("blocked") == false
        val badge = TextView(this).apply {
            text = if (ok) "成功" else "失败"
            textSize = 12f
            setTextColor(Color.parseColor("#E8EDF7"))
            setBackgroundColor(Color.parseColor(if (ok) "#1D5C41" else "#6B2F2F"))
            setPadding(12, 2, 12, 2)
        }
        val o = snap.optJSONObject("outcome")
        val detail = buildString {
            append(wfTitles[snap.optString("workflowId")] ?: snap.optString("workflowId"))
            snap.optString("taskId").takeIf { it.isNotEmpty() }?.let { append("  任务 $it") }
            append('\n')
            if (o != null) {
                if (o.optBoolean("blocked") == false) append("✔ ${nounOf(snap)}成功 → ${o.optString("location", "")}")
                else append("✘ ").append(o.optString("reason", "被拒绝"))
                append('\n')
            }
            val collected = snap.optJSONObject("collected")
            if (collected != null && collected.length() > 0) {
                append(collected.keys().asSequence().joinToString(" · ") { "$it=${collected.opt(it)}" })
            }
        }
        val body = TextView(this).apply {
            text = detail
            textSize = 13f
            setTextColor(Color.parseColor("#8EA0C0"))
        }
        row.addView(badge)
        row.addView(body, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginStart = 24 // 易混读信息硬间隔
        })
        boxHistory.addView(row)
    }

    private fun showError(message: String) {
        Buzz.err(this) // 每次错误都震
        txtError.text = message
        txtError.visibility = View.VISIBLE
    }

    companion object {
        /** 扫码广播兜底 extra 键(实测汇总;Zebra/Urovo 各不同,详见 pda-scan-universal 技能)。 */
        private val SCAN_KEYS = listOf(
            "barcode", "data", "scannerdata", "SCAN_BARCODE",
            "decode_data", "com.symbol.datawedge.data_string",
        )
    }
}
