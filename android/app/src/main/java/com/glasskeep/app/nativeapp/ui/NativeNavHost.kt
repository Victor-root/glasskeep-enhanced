package com.glasskeep.app.nativeapp.ui

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.glasskeep.app.nativeapp.NativeAppContainer

/**
 * The native rewrite's navigation graph. One route per real screen; grows
 * as more of the web app's feature list gets ported (see the migration
 * report's difficulty tiers for the order that makes sense).
 */
@Composable
fun NativeNavHost(container: NativeAppContainer, serverUrl: String) {
    val navController: NavHostController = rememberNavController()
    val startDestination = if (container.tokenStore.token != null) "notes" else "login"

    NavHost(navController = navController, startDestination = startDestination) {
        composable("login") {
            NativeLoginScreen(
                container = container,
                serverUrl = serverUrl,
                onLoggedIn = {
                    navController.navigate("notes") {
                        popUpTo("login") { inclusive = true }
                    }
                },
            )
        }
        composable("notes") {
            NativeNotesListScreen(
                container = container,
                serverUrl = serverUrl,
                onOpenNote = { noteId -> navController.navigate("notes/$noteId") },
            )
        }
        composable("notes/{noteId}") { backStackEntry ->
            val noteId = backStackEntry.arguments?.getString("noteId") ?: return@composable
            NoteDetailScreen(
                container = container,
                serverUrl = serverUrl,
                noteId = noteId,
                onBack = { navController.popBackStack() },
            )
        }
    }
}
