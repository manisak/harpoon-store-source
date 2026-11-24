import QtQuick 2.2
import Sailfish.Silica 1.0

// Root is a Page: sailfish-qml embeds this page into its own app window
Page {
    id: page

    property string storeUrl: "https://harpoon-store.manisak.com"

    ListModel { id: listModel }

    SilicaListView {
        id: listView
        model: listModel
        anchors.fill: parent
        header: PageHeader { title: "Harpoon Store" }
        PullDownMenu {
            MenuItem { text: "Refresh"; onClicked: page.loadApps() }
        }
        delegate: ListItem {
            id: item
            height: Theme.itemSizeLarge
            onClicked: pageStack.push(Qt.resolvedUrl("DetailPage.qml"), { appData: model })

            Row {
                anchors.verticalCenter: parent.verticalCenter
                x: Theme.horizontalPageMargin
                width: parent.width - 2 * Theme.horizontalPageMargin
                spacing: Theme.paddingMedium

                Label { text: "⚓"; font.pixelSize: Theme.fontSizeLarge; anchors.verticalCenter: parent.verticalCenter }
                Column {
                    anchors.verticalCenter: parent.verticalCenter
                    Label { text: model.name; font.pixelSize: Theme.fontSizeMedium; color: item.highlighted ? Theme.highlightColor : Theme.primaryColor }
                    Label { text: model.category + (model.rating > 0 ? "  ·  ★ " + Number(model.rating).toFixed(1) : ""); font.pixelSize: Theme.fontSizeExtraSmall; color: Theme.secondaryColor }
                }
            }
        }
        VerticalScrollDecorator {}
    }

    Label {
        id: loadingLabel
        anchors.centerIn: parent
        text: qsTr("Loading…")
        color: Theme.secondaryColor
    }

    onStatusChanged: if (status === PageStatus.Active && listModel.count === 0) page.loadApps()
}
