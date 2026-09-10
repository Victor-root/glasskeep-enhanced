package com.glasskeep.app.nativeapp.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [NoteEntity::class, NoteDetailEntity::class], version = 9, exportSchema = false)
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
                    .addMigrations(MIGRATION_7_8, MIGRATION_8_9)
                    // Kept only for legacy installs lacking an explicit
                    // old migration path. Versions 7 -> 8 and 8 -> 9 are
                    // non-destructive because this cache can now contain
                    // unsynced local creations; future bumps must migrate it.
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

        private val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `notes` ADD COLUMN `imageNamesJson` TEXT NOT NULL DEFAULT '[]'")
            }
        }
    }
}
