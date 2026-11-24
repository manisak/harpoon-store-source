// Harpoon Store client - QtQuick Item root (QQuickView-compatible)
// No Silica/Page/pageStack: renders inside a plain QQuickView with Item root.
import QtQuick 2.2
import QtQuick.Controls 1.2 as Controls

Rectangle {
    id: root
    color: "#10141b"
    anchors.fill: parent

    property string storeUrl: "https://harpoon-store.manisak.com"
    property string appStatus: "loading…"
    property bool showDetail: false
    property var detailData: null

    function loadApps() {
        statusLabel.text = "loading…"
        var xhr = new XMLHttpRequest();
        xhr.open("GET", storeUrl + "/api/apps.json", true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    try {
                        var obj = JSON.parse(xhr.responseText);
                        listModel.clear();
                        for (var i = 0; i < obj.apps.length; i++) {
                            listModel.append({
                                id: obj.apps[i].id,
                                name: obj.apps[i].name,
                                description: obj.apps[i].description,
                                repo_url: obj.apps[i].repo_url,
                                category: obj.apps[i].category,
                                rating: obj.apps[i].rating,
                                ratings: obj.apps[i].ratings,
                                current_version: obj.apps[i].current_version
                            });
                        }
                        statusLabel.text = "";
                    } catch (e) {
                        statusLabel.text = "Parse error: " + e;
                    }
                } else {
                    statusLabel.text = "Store not reachable (HTTP " + xhr.status + ")";
                }
            }
        };
        xhr.send();
    }

    Component.onCompleted: loadApps()

    ListModel { id: listModel }

    Text {
        id: headerTitle
        text: showDetail && detailData ? (detailData.name ? "← " + detailData.name : "←") : "⚓ Harpoon Store"
        color: "#f2953c"
        font.pixelSize: 34
        x: 12
        y: 8
        MouseArea {
            anchors.fill: parent
            onClicked: { showDetail = false; detailData = null }
        }
    }

    Text {
        id: statusLabel
        text: appStatus
        color: "#8ea1b5"
        anchors.centerIn: parent
        font.pixelSize: 28
    }

    // LIST VIEW
    ListView {
        id: listView
        visible: !showDetail
        anchors.fill: parent
        anchors.topMargin: 60
        model: listModel
        delegate: Item {
            width: listView.width
            height: 120
            Rectangle { anchors.fill: parent; color: index % 2 === 0 ? "#151b22" : "#10141b" }
            MouseArea {
                anchors.fill: parent
                onClicked: {
                    detailData = {
                        id: model.id, name: model.name, description: model.description,
                        repo_url: model.repo_url, category: model.category,
                        rating: model.rating, ratings: model.ratings,
                        current_version: model.current_version
                    };
                    showDetail = true;
                }
            }
            Text { text: model.name; color: "#f2953c"; font.pixelSize: 28; x: 16; y: 14 }
            Text { text: model.category; color: "#8ea1b5"; font.pixelSize: 18; x: 18; y: 60 }
            Text {
                text: model.rating > 0 ? "★ " + Number(model.rating).toFixed(1) : ""
                color: "#ffd08a"; font.pixelSize: 18; anchors.right: parent.right; anchors.margins: 16; y: 30
            }
        }
        Text {
            visible: listModel.count === 0 && statusLabel.text !== "loading…"
            text: "No apps"
            color: "#8ea1b5"; anchors.centerIn: parent
        }
    }

    // DETAIL VIEW
    Flickable {
        id: detailView
        visible: showDetail && detailData !== null
        anchors.fill: parent
        anchors.topMargin: 60
        contentHeight: detailContent.height + 40

        Row {
            id: detailContent
            anchors.margins: 16
            x: 16; y: 16
            spacing: 12
            Column {
                spacing: 14
                width: root.width - 32
                Text {
                    text: detailData ? detailData.category : ""
                    color: "#8ea1b5"; font.pixelSize: 18
                }
                Text {
                    text: detailData ? (detailData.rating > 0 ? "★ " + Number(detailData.rating).toFixed(1) + " / 5 (" + detailData.ratings + ")" : "No ratings yet") : ""
                    color: "#ffd08a"; font.pixelSize: 22
                }
                Text {
                    text: detailData ? (detailData.current_version ? "Current version: " + detailData.current_version : "") : ""
                    color: "#ffffff"; font.pixelSize: 22
                }
                Text {
                    width: parent.width
                    text: detailData ? detailData.description : ""
                    color: "#e0e6ec"; font.pixelSize: 22; wrapMode: Text.Wrap; textFormat: Text.PlainText
                }
                Text {
                    width: parent.width
                    text: "Repository:\n" + (detailData ? detailData.repo_url : "")
                    color: "#8ea1b5"; font.pixelSize: 19; wrapMode: Text.Wrap
                }
                Text {
                    width: root.width - 32
                    text: "→ Open this app and tap 'Harpoon' — install it now by using the Install with Harpoon button below."
                    color: "#8ea1b5"; font.pixelSize: 18; wrapMode: Text.Wrap
                }
                Rectangle {
                    color: "#f2953c"
                    radius: 12
                    width: 440; height: 70
                    Text { color: "#10141b"; font.pixelSize: 28; font.bold: true; anchors.centerIn: parent; text: "⚓ Install with Harpoon" }
                    MouseArea {
                        anchors.fill: parent
                        onClicked: {
                            if (detailData) Qt.openUrlExternally("harpoon://add?url=" + encodeURIComponent(detailData.repo_url));
                        }
                    }
                }
            }
        }
    }
}
