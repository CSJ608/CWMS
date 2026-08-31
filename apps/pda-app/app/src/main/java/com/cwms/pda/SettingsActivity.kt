package com.cwms.pda

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/** 设置页:服务器地址与广播 action。保存后回主界面即生效(主界面 onResume 重读)。 */
class SettingsActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val editServer = findViewById<EditText>(R.id.editServer)
        val editAction = findViewById<EditText>(R.id.editAction)
        editServer.setText(Prefs.server(this))
        editAction.setText(Prefs.scanAction(this))

        findViewById<Button>(R.id.btnSave).setOnClickListener {
            Prefs.of(this).edit()
                .putString("server", editServer.text.toString().trim())
                .putString("scan_action", editAction.text.toString().trim())
                .apply()
            Toast.makeText(this, "已保存", Toast.LENGTH_SHORT).show()
            finish()
        }
    }
}
