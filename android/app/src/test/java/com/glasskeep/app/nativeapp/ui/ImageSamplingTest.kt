package com.glasskeep.app.nativeapp.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class ImageSamplingTest {
    @Test fun aPhotoIsHalvedUntilJustAboveItsDrawnSize() {
        assertEquals(2, fittingSampleSize(1600, 1200, 2016, 600))
        assertEquals(4, fittingSampleSize(4000, 3000, 2016, 600))
    }

    @Test fun anImageSmallerThanItsBoxIsKeptWhole() = assertEquals(1, fittingSampleSize(100, 80, 2016, 600))

    @Test fun unknownSizesAreKeptWhole() {
        assertEquals(1, fittingSampleSize(0, 0, 2016, 600))
        assertEquals(1, fittingSampleSize(1600, 1200, 0, 0))
    }
}
