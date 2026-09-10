package com.glasskeep.app.nativeapp.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [NoteEntity::class, NoteDetailEntity::class], version = 8, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun noteDao(): NoteDao

    companion object {
        @Volatile private var instance: AppDatabase? = null

        fun get(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "glasskeep_native.db",
                )
                    .addMigrations(MIGRATION_7_8)
                    // Kept only for legacy installs lacking an explicit
                    // old migration path. Version 7 -> 8 is non-destructive
                    // because note_details now also contains unsynced local
                    // creations; every future bump must likewise migrate it.
                    .fallbackToDestructiveMigration(dropAllTables = true)
                    .build().also { instance = it }
            }

        private val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `note_details` " +
                        "(`noteId` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, PRIMARY KEY(`noteId`))",
                )
            }
        }
    }
}
