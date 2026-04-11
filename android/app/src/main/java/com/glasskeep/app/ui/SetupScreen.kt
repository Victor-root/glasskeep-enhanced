package com.glasskeep.app.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
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

// Floating card colors matching the web app
private val FloatingCardColors = listOf(
    Color(0xFF6366f1), // Indigo
    Color(0xFFa855f7), // Purple
    Color(0xFF10b981), // Teal
    Color(0xFFf59e0b), // Amber
    Color(0xFFf97316), // Orange
    Color(0xFF0ea5e9), // Sky Blue
    Color(0xFF84cc16), // Lime
    Color(0xFFec4899), // Pink
    Color(0xFF14b8a6), // Cyan
    Color(0xFFf43f5e), // Rose
)

private data class FloatingCard(
    val xFraction: Float,   // 0..1 horizontal position
    val yFraction: Float,   // 0..1 vertical position
    val rotation: Float,    // degrees
    val colorIndex: Int,
    val durationMs: Int,
    val delayMs: Int,
    val widthDp: Dp
)

private val floatingCards = listOf(
    FloatingCard(0.05f, 0.08f, -12f, 0, 7000, 0, 110.dp),
    FloatingCard(0.70f, 0.05f, 8f, 1, 8000, 500, 100.dp),
    FloatingCard(0.85f, 0.22f, -6f, 2, 9000, 1200, 95.dp),
    FloatingCard(0.02f, 0.35f, 10f, 3, 10000, 800, 105.dp),
    FloatingCard(0.75f, 0.42f, -15f, 4, 8500, 2000, 90.dp),
    FloatingCard(0.10f, 0.62f, 5f, 5, 9500, 1500, 100.dp),
    FloatingCard(0.80f, 0.65f, -8f, 6, 7500, 3000, 95.dp),
    FloatingCard(0.00f, 0.82f, 13f, 7, 10500, 600, 110.dp),
    FloatingCard(0.65f, 0.85f, -10f, 8, 11000, 2500, 85.dp),
    FloatingCard(0.35f, 0.92f, 7f, 9, 8000, 1800, 100.dp),
)

@Composable
private fun FloatingCardsBackground() {
    val transition = rememberInfiniteTransition(label = "float")

    Box(modifier = Modifier.fillMaxSize()) {
        floatingCards.forEach { card ->
            val animOffset by transition.animateFloat(
                initialValue = 0f,
                targetValue = -18f,
                animationSpec = infiniteRepeatable(
                    animation = tween(
                        durationMillis = card.durationMs,
                        delayMillis = card.delayMs,
                        easing = LinearEasing
                    ),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "card_${card.colorIndex}"
            )

            val accentColor = FloatingCardColors[card.colorIndex]

            Box(
                modifier = Modifier
                    .fillMaxSize()
            ) {
                Column(
                    modifier = Modifier
                        .offset(x = (card.xFraction * 300).dp, y = (card.yFraction * 700).dp)
                        .offset(y = animOffset.dp)
                        .rotate(card.rotation)
                        .width(card.widthDp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White.copy(alpha = 0.35f))
                ) {
                    // Top colored border
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(3.dp)
                            .background(accentColor.copy(alpha = 0.7f))
                    )
                    Column(modifier = Modifier.padding(10.dp)) {
                        // Title line
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.7f)
                                .height(8.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(accentColor.copy(alpha = 0.2f))
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        // Content lines
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.9f)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(Color(0xFF9ca3af).copy(alpha = 0.15f))
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.6f)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(Color(0xFF9ca3af).copy(alpha = 0.15f))
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(0.75f)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(Color(0xFF9ca3af).copy(alpha = 0.15f))
                        )
                    }
                }
            }
        }
    }
}

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
        // Floating cards behind everything
        FloatingCardsBackground()

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
                        focusedTextColor = Color(0xFF1f2937),
                        unfocusedTextColor = Color(0xFF1f2937),
                        focusedBorderColor = Indigo,
                        unfocusedBorderColor = BorderColor,
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
