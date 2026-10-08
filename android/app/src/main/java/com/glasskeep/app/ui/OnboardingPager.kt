package com.glasskeep.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import android.util.Log
import com.glasskeep.app.BuildConfig
import com.glasskeep.app.R
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
    initialUrl: String = "",
    onWelcomeCompleted: () -> Unit,
    onConnect: (String) -> Unit,
) {
    val pagerState = rememberPagerState(
        initialPage = if (startAtSetup) 1 else 0,
        pageCount = { 2 },
    )
    val scope = rememberCoroutineScope()
    val dark = isSystemInDarkTheme()
    val tv = isTelevision()

    // A remote has no swipe, and a pager that scrolls under its focus
    // moved it from page to page. On TV the two pages are therefore shown
    // one at a time, through their buttons only.
    var tvPage by remember { mutableIntStateOf(if (startAtSetup) 1 else 0) }
    val currentPage = if (tv) tvPage else pagerState.currentPage
    val goTo: (Int) -> Unit = { page ->
        if (BuildConfig.DEBUG) Log.d("GKOnboarding", "goTo($page) from page $currentPage")
        if (tv) tvPage = page else scope.launch { pagerState.animateScrollToPage(page) }
    }
    BackHandler(enabled = tv && tvPage == 1) {
        if (BuildConfig.DEBUG) Log.d("GKOnboarding", "Back key on the setup page")
        tvPage = 0
    }
    if (BuildConfig.DEBUG) {
        DisposableEffect(Unit) {
            Log.d("GKOnboarding", "onboarding composed, tv=$tv, page=$currentPage")
            onDispose { Log.d("GKOnboarding", "onboarding disposed") }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        if (tv) {
            OnboardingPage(tvPage, initialUrl, onWelcomeCompleted, goTo, onConnect)
        } else {
            HorizontalPager(
                state = pagerState,
                modifier = Modifier.fillMaxSize(),
            ) { page ->
                OnboardingPage(page, initialUrl, onWelcomeCompleted, goTo, onConnect)
            }
        }

        PageDots(
            currentPage = currentPage,
            pageCount = 2,
            dark = dark,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 16.dp),
        )

        // Back-arrow overlay only visible on the setup page. Swipe-back
        // still works alongside it, but a discoverable tap target at
        // the top-left covers users who don't know about the swipe.
        if (currentPage == 1) {
            BackButton(
                dark = dark,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(start = 12.dp, top = 12.dp),
                onClick = { goTo(0) },
            )
        }
    }
}

@Composable
private fun OnboardingPage(
    page: Int,
    initialUrl: String,
    onWelcomeCompleted: () -> Unit,
    goTo: (Int) -> Unit,
    onConnect: (String) -> Unit,
) {
    when (page) {
        0 -> WelcomeScreen(onContinue = {
            // Persist the ack THEN move on so a user who quits
            // mid-scroll still gets the "welcome already seen"
            // skip on next launch.
            onWelcomeCompleted()
            goTo(1)
        })
        1 -> SetupScreen(initialUrl = initialUrl, onConnect = onConnect)
    }
}

@Composable
private fun BackButton(
    dark: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .size(40.dp)
            .clip(CircleShape)
            .background(
                if (dark) Color(0xFF282828).copy(alpha = 0.6f)
                else Color.White.copy(alpha = 0.6f)
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painter = painterResource(R.drawable.ic_tabler_chevron_left),
            contentDescription = null,
            tint = if (dark) DarkTitleColor else LightTitleColor,
            modifier = Modifier.size(22.dp),
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
