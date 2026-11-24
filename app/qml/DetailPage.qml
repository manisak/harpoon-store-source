import QtQuick 2.2
import Sailfish.Silica 1.0

Page {
    id: page
    property var appData

    SilicaFlickable {
        anchors.fill: parent
        contentHeight: contentColumn.height + Theme.paddingLarge

        PullDownMenu {
            MenuItem {
                text: "Install with Harpoon"
                onClicked: Qt.openUrlExternally("harpoon://add?url=" + encodeURIComponent(appData.repo_url))
            }
            MenuItem {
                text: "Open in browser"
                onClicked: Qt.openUrlExternally(appData.repo_url)
            }
        }

        Column {
            id: contentColumn
            x: Theme.horizontalPageMargin
            width: parent.width - 2 * Theme.horizontalPageMargin
            spacing: Theme.paddingMedium

            PageHeader { title: appData.name }

            Label {
                text: appData.category + (appData.current_version ? "  ·  current version: " + appData.current_version : "")
                color: Theme.secondaryColor
                font.pixelSize: Theme.fontSizeSmall
            }
            Label {
                text: appData.rating > 0 ? "★ " + Number(appData.rating).toFixed(1) + " / 5 (" + appData.ratings + " ratings)" : "No ratings yet"
                color: Theme.highlightColor
                font.pixelSize: Theme.fontSizeSmall
            }

            Label { text: appData.description; wrapMode: Text.Wrap; width: parent.width; font.pixelSize: Theme.fontSizeSmall }

            Label { text: "Source: " + appData.repo_url; wrapMode: Text.Wrap; width: parent.width; color: Theme.secondaryColor; font.pixelSize: Theme.fontSizeExtraSmall }

            Button {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "Install / update with Harpoon"
                onClicked: Qt.openUrlExternally("harpoon://add?url=" + encodeURIComponent(appData.repo_url))
            }

            Label {
                text: "Harpoon opens with this repository pre-filled — confirm there to install or update."
                width: parent.width
                wrapMode: Text.Wrap
                color: Theme.secondaryColor
                font.pixelSize: Theme.fontSizeExtraSmall
            }
        }
    }
}
