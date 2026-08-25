import XCTest

final class NativeAccessibilityUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testStagingWrapperExposesAccessibleNavigationAndLocationOverlay() throws {
        app.launch()

        let serverHeading = app.staticTexts["Velg server"]
        XCTAssertTrue(serverHeading.waitForExistence(timeout: 15))

        let addressField = app.textFields["192.168.1.23:3000"]
        XCTAssertTrue(addressField.isHittable)
        addressField.tap()
        addressField.typeText("localhost:3000")
        serverHeading.tap()

        let connectButton = app.buttons["Koble til lokal server"]
        XCTAssertEqual(connectButton.label, "Koble til lokal server")
        XCTAssertTrue(connectButton.isHittable)
        connectButton.tap()

        let exploreButton = app.buttons["Utforsk Kaupet"]
        XCTAssertTrue(exploreButton.waitForExistence(timeout: 30))
        XCTAssertTrue(app.staticTexts["Velkommen!"].exists)
        XCTAssertTrue(exploreButton.isHittable)
        exploreButton.tap()

        let continueButton = app.buttons["Fortsett til Kaupet"]
        XCTAssertTrue(continueButton.waitForExistence(timeout: 5))
        continueButton.tap()

        let homeTab = app.links["Hjem"]
        let searchButton = app.buttons["Søk"]
        let newListingLink = app.links["Ny annonse"]
        let locationOpener = app.buttons["Velg lokasjon: Hvor som helst"]

        XCTAssertTrue(locationOpener.waitForExistence(timeout: 30))
        XCTAssertEqual(homeTab.label, "Hjem")
        XCTAssertTrue(homeTab.isHittable)
        XCTAssertEqual(searchButton.label, "Søk")
        XCTAssertTrue(searchButton.isHittable)
        XCTAssertEqual(newListingLink.label, "Ny annonse")
        XCTAssertTrue(newListingLink.isHittable)
        XCTAssertEqual(locationOpener.label, "Velg lokasjon: Hvor som helst")
        XCTAssertTrue(locationOpener.isHittable)
        locationOpener.tap()

        let locationDialog = app.otherElements["Velg sted"]
        let locationSearch = app.textFields["Søk etter sted"]
        let useLocationButton = app.buttons["Bruk min posisjon"]
        let closeButton = app.buttons["Lukk"]

        XCTAssertTrue(locationDialog.waitForExistence(timeout: 5))
        XCTAssertTrue(locationDialog.isHittable)
        XCTAssertTrue(locationDialog.hasFocus)
        XCTAssertEqual(locationSearch.label, "Søk etter sted")
        XCTAssertTrue(locationSearch.isHittable)
        XCTAssertEqual(useLocationButton.label, "Bruk min posisjon")
        XCTAssertTrue(useLocationButton.isHittable)
        XCTAssertEqual(closeButton.label, "Lukk")
        XCTAssertTrue(closeButton.isHittable)
        closeButton.tap()

        XCTAssertTrue(locationDialog.waitForNonExistence(timeout: 5))
        XCTAssertTrue(locationOpener.isHittable)
    }
}
