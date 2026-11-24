import QtQuick 2.2
import Sailfish.Silica 1.0

Page {
    id: page

    ListModel { id: listModel }

    SilicaListView {
        id: listView
        model: listModel
        anchors.fill: parent
        header: PageHeader { title: "Harpoon Store" }
        PullDownMenu {
            MenuItem { text: "Refresh"; onClicked: appWindow.loadApps() }
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
                    Label {
                        text: model.category + (model.rating > 0 ? "  ·  ★ " + Number(model.rating).toFixed(1) + " (" + model.ratings + ")" : "")
                        font.pixelSize: Theme.fontSizeExtraSmall; color: Theme.secondaryColor
                    }
                }
            }
        }
        Column {
            anchors.centerIn: parent
            Label { id: loadingLabel; text: "Loading…" ; color: Theme.secondaryColor }
        }
        VerticalScrollDecorator {}
    }

    BusyIndicator {
        anchors.centerIn: parent
        running: visible
        visible: listModel.count === 0
    }

    onStatusChanged: if (status === PageStatus.Active && listModel.count === 0) appWindow.loadApps()
}
