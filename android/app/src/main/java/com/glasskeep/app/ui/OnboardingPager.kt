package com.glasskeep.app.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * Two-step onboarding pager:
 *   • Page 0 — [WelcomeScreen] with the four permission cards
 *   • Page 1 — [SetupScreen] where the user enters their server URL
 *
 * Tapping "Suivant" on the welcome screen smoothly animates to the
 * setup page. The pager supports swipe gestures in both directions
 * so a user who scrolled past too fast can swipe back to grant a
 * permission they missed.
 *
 * [startAtSetup] lets MainActivity skip straight to page 1 for users
 * who have already completed the welcome (e.g. an existing 1.2.x
 * install that's just changed its server URL).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun OnboardingPager(
    startAtSetup: Boolean,
    onWelcomeCompleted: () -> Unit,
    onConnect: (String) -> Unit,
) {
    val pagerState = rememberPagerState(
        initialPage = if (startAtSetup) 1 else 0,
        pageCount = { 2 },
    )
    val scope = rememberCoroutineScope()
    val dark = isSystemInDarkTheme()

    Box(modifier = Modifier.fillMaxSize()) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
        ) { page ->
            when (page) {
                0 -> WelcomeScreen(onContinue = {
                    // Persist the ack THEN animate so a user who quits
                    // mid-scroll still gets the "welcome already seen"
                    // skip on next launch.
                    onWelcomeCompleted()
                    scope.launch { pagerState.animateScrollToPage(1) }
                })
                1 -> SetupScreen(onConnect = onConnect)
            }
        }

        PageDots(
            currentPage = pagerState.currentPage,
            pageCount = 2,
            dark = dark,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 16.dp),
        )
    }
}

@Composable
private fun PageDots(
    currentPage: Int,
    pageCount: Int,
    dark: Boolean,
    modifier: Modifier = Modifier,
) {
    val inactive =
        (if (dark) DarkSubtextColor else LightSubtextColor).copy(alpha = 0.4f)
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(pageCount) { i ->
            val active = currentPage == i
            // Active page = wide indigo pill; the others stay as
            // tiny round dots so the user can tell at a glance where
            // they are in the flow.
            val width = if (active) 24.dp else 8.dp
            val color: Color = if (active) Indigo else inactive
            Box(
                modifier = Modifier
                    .size(width = width, height = 8.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(color),
            )
        }
    }
}
