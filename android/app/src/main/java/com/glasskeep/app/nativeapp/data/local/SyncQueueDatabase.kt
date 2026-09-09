package com.glasskeep.app.nativeapp.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

/**
 * Its own database file, separate from AppDatabase on purpose (see
 * SyncQueueEntity's own doc comment): this one holds edits the server
 * hasn't confirmed yet, so unlike AppDatabase it must NEVER get a
 * fallbackToDestructiveMigration. Version 1 has no prior version to
 * migrate from; the first real schema change here needs a written
 * Migration, not a shortcut.
 */
@Database(entities = [SyncQueueEntity::class], version = 1, exportSchema = false)
abstract class SyncQueueDatabase : RoomDatabase() {
    abstract fun syncQueueDao(): SyncQueueDao

    companion object {
        @Volatile private var instance: SyncQueueDatabase? = null

        fun get(context: Context): SyncQueueDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    SyncQueueDatabase::class.java,
                    "glasskeep_sync_queue.db",
                ).build().also { instance = it }
            }
    }
}
