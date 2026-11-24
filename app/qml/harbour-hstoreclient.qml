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
        text: appStatus
        color: Theme.highlightColor
    }

    function loadApps(xhr_status) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", storeUrl + "/api/apps.json", true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    try {
                        var obj = JSON.parse(xhr.responseText);
                        listModel.clear();
                        for (var i = 0; i < obj.apps.length; i++) listModel.append(obj.apps[i]);
                        appStatus = "ok: " + obj.apps.length + " apps";
                    } catch (e) { appStatus = "Parse error: " + e; }
                } else {
                    appStatus = "Store not reachable (HTTP " + xhr.status + ")";
                }
            }
        };
        xhr.send();
    }

    onStatusChanged: if (status === PageStatus.Active && listModel.count === 0) page.loadApps()
}
