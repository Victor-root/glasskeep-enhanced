package com.glasskeep.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.glasskeep.app.R

// TV theme: mirrors the in-app TvLogin React component (dark radial
// gradient backdrop, violet→pink brand title, glass card, gradient
// submit button). Used only when isTelevision() returns true.
private val TvBgTop = Color(0xFF1a1530)
private val TvBgMid = Color(0xFF0b0d12)
internal val TvBgBottom = Color(0xFF06070b)
private val TvCardBg = Color(0xFF0F1119).copy(alpha = 0.85f)
private val TvCardBorder = Color(0xFFffffff).copy(alpha = 0.08f)
private val TvTitleStart = Color(0xFFc4b5fd) // violet-300
private val TvTitleEnd = Color(0xFFf9a8d4)   // pink-300
private val TvSubtextColor = Color(0xFF9ca3af)
private val TvBodyColor = Color(0xFFf9fafb)
private val TvAccent = Color(0xFFa78bfa) // violet-400: focus / accent

// TV variant of the setup screen. Same fields and the same doConnect
// behaviour, but rendered with the dark-violet glass theme that
// matches the in-app TvLogin React component. No floating cards
// decoration here: keeps the layout calm at 10-foot distance.
@Composable
internal fun TvSetupScreen(
    url: String,
    onUrlChange: (String) -> Unit,
    error: String?,
    cleartextNotice: Boolean,
    loading: Boolean,
    onConnect: () -> Unit,
) {
    val brandBrush = Brush.horizontalGradient(listOf(TvTitleStart, TvTitleEnd))
    val bgBrush = Brush.radialGradient(
        colors = listOf(TvBgTop, TvBgMid, TvBgBottom),
        center = Offset(0.2f, 0f),
        radius = 1800f
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(bgBrush),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.55f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            GlassKeepLogo(size = 84.dp, cornerRadius = 20.dp, elevation = 12.dp)

            Spacer(modifier = Modifier.height(10.dp))

            // TextStyle.brush (Compose 1.4+) fills the glyphs with the
            // gradient: same effect the web brand uses.
            Text(
                text = "GlassKeep TV",
                style = TextStyle(
                    brush = brandBrush,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.ExtraBold
                )
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = stringResource(R.string.setup_subtitle),
                fontSize = 13.sp,
                color = TvSubtextColor
            )

            Spacer(modifier = Modifier.height(18.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(TvCardBg)
                    .padding(24.dp)
            ) {
                ServerUrlField(
                    url = url,
                    onUrlChange = onUrlChange,
                    error = error,
                    cleartextNotice = cleartextNotice,
                    onGo = onConnect,
                    textColor = TvBodyColor,
                    accentColor = TvAccent,
                    borderColor = TvCardBorder,
                    subtextColor = TvSubtextColor,
                    errorColor = Color(0xFFfca5a5),
                )

                Spacer(modifier = Modifier.height(20.dp))

                ConnectButton(loading = loading, onClick = onConnect, height = 52.dp)
            }
        }
    }
}
