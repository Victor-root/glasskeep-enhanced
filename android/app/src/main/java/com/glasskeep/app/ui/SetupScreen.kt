package com.glasskeep.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R

private val BgGradient = Brush.linearGradient(
    colors = listOf(
        Color(0xFFf0e8ff),
        Color(0xFFe8f4fd),
        Color(0xFFfde8f0)
    ),
    start = Offset(0f, 0f),
    end = Offset(Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY)
)

private val ButtonGradient = Brush.horizontalGradient(
    colors = listOf(Color(0xFF6366f1), Color(0xFF7c3aed))
)

private val CardBg = Color(0xFFFFFFFF).copy(alpha = 0.7f)
private val BorderColor = Color(0xFFd1d5db).copy(alpha = 0.3f)
private val Indigo = Color(0xFF6366f1)
private val SubtextColor = Color(0xFF6b7280)

@Composable
fun SetupScreen(onConnect: (String) -> Unit) {
    var url by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BgGradient),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Logo
            Image(
                painter = painterResource(id = R.drawable.glasskeep_logo),
                contentDescription = "GlassKeep",
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .shadow(8.dp, RoundedCornerShape(18.dp))
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Title
            Text(
                text = "Glass Keep",
                fontSize = 30.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF1f2937)
            )

            // Subtitle
            Text(
                text = "Connectez-vous a votre serveur",
                fontSize = 14.sp,
                color = SubtextColor
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Glass card
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(CardBg)
                    .padding(24.dp)
            ) {
                OutlinedTextField(
                    value = url,
                    onValueChange = {
                        url = it
                        error = null
                    },
                    label = { Text("Adresse du serveur") },
                    placeholder = { Text("https://votre-serveur.com") },
                    singleLine = true,
                    isError = error != null,
                    supportingText = error?.let { msg -> { Text(msg, color = Color(0xFFdc2626)) } },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Uri,
                        imeAction = ImeAction.Go
                    ),
                    keyboardActions = KeyboardActions(
                        onGo = { validateAndConnect(url.trim(), onConnect) { error = it } }
                    ),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Indigo,
                        focusedLabelColor = Indigo,
                        cursorColor = Indigo
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(20.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(ButtonGradient)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            role = Role.Button
                        ) { validateAndConnect(url.trim(), onConnect) { error = it } },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        "Se connecter",
                        fontWeight = FontWeight.SemiBold,
                        color = Color.White,
                        fontSize = 16.sp
                    )
                }
            }
        }
    }
}

private fun validateAndConnect(
    url: String,
    onConnect: (String) -> Unit,
    onError: (String) -> Unit
) {
    when {
        url.isBlank() -> onError("Veuillez entrer une URL")
        !url.startsWith("http://") && !url.startsWith("https://") ->
            onError("L'URL doit commencer par http:// ou https://")
        else -> onConnect(url.trimEnd('/'))
    }
}
