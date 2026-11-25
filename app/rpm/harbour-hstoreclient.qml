// Final harbour-hstoreclient.qml v0.2.2: harpoon://add mit source param wenn detectable
import QtQuick 2.2
import Sailfish.Silica 1.0

Rectangle {
    id: root
    color: "#10141b"
    anchors.fill: parent

    property string storeUrl: "https://harpoon-store.manisak.com"
    property string appStatus: "loading…"
    property bool showDetail: false
    property var detailData: null

    ListModel { id: catModel }
    ListModel { id: listModel }

    function harpoonLink(repoUrl, source) {
        var link = "harpoon://add?url=" + encodeURIComponent(repoUrl);
        if (source) link += "&source=" + source;
        return link;
    }

    function loadCats() {
        var x = new XMLHttpRequest();
        x.open("GET", storeUrl + "/api/categories.json", true);
        x.onreadystatechange = function () {
            if (x.readyState === XMLHttpRequest.DONE && x.status === 200) {
                try {
                    var o = JSON.parse(x.responseText);
                    catModel.clear();
                    catModel.append({ slug: "", name: "All", count: 0 });
                    for (var i = 0; i < o.categories.length; i++) catModel.append(o.categories[i]);
                } catch (e) { appStatus = "CatParse " + e; }
            }
        };
        x.send();
    }
    function loadApps() {
        appStatus = "loading…";
        var x = new XMLHttpRequest();
        x.open("GET", storeUrl + "/api/apps.json" + (activeCat ? "?cat=" + activeCat : ""), true);
        x.onreadystatechange = function () {
            if (x.readyState === XMLHttpRequest.DONE) {
                if (x.status === 200) {
                    try {
                        var o = JSON.parse(x.responseText);
                        listModel.clear();
                        for (var i = 0; i < o.apps.length; i++) listModel.append({
                            appId: o.apps[i].id, name: o.apps[i].name, description: o.apps[i].description,
                            repoUrl: o.apps[i].repo_url, appCategory: o.apps[i].category, iconUrl: o.apps[i].iconUrl,
                            appRating: o.apps[i].rating, ratingsN: o.apps[i].ratings, currentVersion: o.apps[i].current_version,
                            appSource: o.apps[i].source || ""
                        });
                        appStatus = ""; // success
                    } catch (e) { appStatus = "Parse error: " + e; }
                } else { appStatus = "Store not reachable (HTTP " + x.status + ")"; }
            }
        };
        x.send();
    }
    function selectCat(slug) {
        activeCat = slug; loadApps();
        catListPage.visible = false; appsPage.visible = true;
    }
    function backToMain() {
        activeCat = "";
        appsPage.visible = false; catListPage.visible = true;
    }
    Component.onCompleted: { loadCats(); loadApps(); }

    // ===== Seite 1: Kategorien =====
    Item {
        id: catListPage
        anchors.fill: parent
        Text { text: "⚓ Harpoon Store"; color: "#f2953c"; font.pixelSize: 42; x: 16; y: 16 }
        Text { text: "Kategorien"; color: "#8ea1b5"; font.pixelSize: 22; x: 16; y: 110 }
        Column {
            x: 16; y: 146; width: root.width - 32; spacing: 6
            Repeater {
                model: catModel
                Rectangle {
                    color: root.activeCat === slug ? "#f2953c" : "#2a333d"
                    radius: 8; width: parent.width; height: 70
                    Text { x: 18; anchors.verticalCenter: parent.verticalCenter; text: name + "   (" + count + " Apps)"; color: root.activeCat === slug ? "#10141b" : "#e0e6ec"; font.pixelSize: 26 }
                    MouseArea { anchors.fill: parent; onClicked: { if (slug) root.selectCat(slug); } }
                }
            }
        }

        // apps der kategorie in der hauptseite unter den kategorien
        Column {
            x: 16; y: 640; width: root.width - 32; spacing: 4
            Repeater {
                model: listModel
                delegate: Rectangle {
                    width: root.width - 32; height: 100
                    color: "#1c232b"
                    radius: 10
                    MouseArea { anchors.fill: parent; onClicked: { detailData = { id: model.appId, name: model.name, description: model.description, repoUrl: model.repoUrl, appCategory: model.appCategory, iconUrl: model.iconUrl, appRating: model.appRating, ratings: model.ratingsN, currentVersion: model.currentVersion, appSource: model.appSource }; catListPage.visible = false; appDetailPage.visible = true } }
                    Row {
                        x: 12; y: 8
                        spacing: 12
                        Rectangle {
                            width: 70; height: 70; radius: 10
                            color: "#14181e"
                            Image { anchors.fill: parent; anchors.margins: 4; source: model.iconUrl ? ("https://harpoon-store.manisak.com" + model.iconUrl) : ""; fillMode: Image.PreserveAspectFit; visible: model.iconUrl ? true : false }
                            Text { anchors.centerIn: parent; text: model.name.charAt(0); color: "#f2953c"; font.pixelSize: 30; visible: !model.iconUrl }
                        }
                        Column {
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: 4
                            Text { text: model.name; color: "#f2953c"; font.pixelSize: 26 }
                            Text { text: model.appCategory + (model.currentVersion ? "  ·  v" + model.currentVersion : "") + (model.appRating > 0 ? "  ·  ★ " + model.appRating : ""); color: "#8ea1b5"; font.pixelSize: 18 }
                        }
                    }
                }
            }
        }

        Text { text: appStatus; color: "#ffb36b"; font.pixelSize: 22; anchors.centerIn: parent; visible: appStatus !== "loading…" && appStatus !== "" && appStatus !== "" }
    }

    // ===== Seite 2: App-Detail (dunkel mit Icon) =====
    Item {
        id: appDetailPage
        anchors.fill: parent
        visible: false

        Rectangle {
            x: 16; y: 16
            color: "#2a333d"; radius: 10; width: 140; height: 64
            Text { anchors.centerIn: parent; text: "← Back"; color: "#f2953c"; font.pixelSize: 26 }
            MouseArea { anchors.fill: parent; onClicked: { appDetailPage.visible = false; catListPage.visible = true } }
        }

        Row {
            x: 16; y: 110
            spacing: 16
            Rectangle {
                width: 110; height: 110; radius: 14
                color: "#1c232b"
                Image { anchors.fill: parent; anchors.margins: 6; source: detailData && detailData.iconUrl ? "https://harpoon-store.manisak.com" + detailData.iconUrl : ""; fillMode: Image.PreserveAspectFit; visible: detailData && detailData.iconUrl ? true : false }
                Text { anchors.centerIn: parent; text: detailData && detailData.name ? detailData.name.charAt(0) : "?"; color: "#f2953c"; font.pixelSize: 40; visible: !detailData || !detailData.iconUrl }
            }
            Column {
                anchors.verticalCenter: parent.verticalCenter
                spacing: 8
                Text { text: detailData ? detailData.name : ""; color: "#f2953c"; font.pixelSize: 34 }
                Text { text: detailData ? detailData.appCategory : ""; color: "#8ea1b5"; font.pixelSize: 20 }
                Text { text: detailData && detailData.appRating > 0 ? ("★ " + detailData.appRating.toFixed(1) + " / 5 (" + detailData.ratings + " ratings)") : "No ratings yet"; color: "#ffd08a"; font.pixelSize: 20 }
                Text { text: detailData && detailData.currentVersion ? ("Current version: v" + detailData.currentVersion) : "Current version: latest"; color: "#8ea1b5"; font.pixelSize: 18 }
            }
        }

        Text {
            x: 16; y: 260; width: root.width - 32
            text: detailData ? detailData.description : ""
            color: "#e0e6ec"; font.pixelSize: 22; wrapMode: Text.Wrap
        }

        Text {
            x: 16; y: 700; width: root.width - 32
            text: detailData ? "Repository:\n" + detailData.repoUrl : ""
            color: "#8ea1b5"; font.pixelSize: 20; wrapMode: Text.Wrap
        }

        Rectangle {
            x: 16; y: 830; color: "#f2953c"; radius: 12; width: root.width - 32; height: 90
            Text { color: "#10141b"; font.pixelSize: 30; font.bold: true; anchors.centerIn: parent; text: "⚓ Install with Harpoon" }
            MouseArea { anchors.fill: parent; onClicked: {
                if (detailData) {
                    var link = "harpoon://add?url=" + encodeURIComponent(detailData.repoUrl);
                    if (detailData.appSource) link += "&source=" + detailData.appSource;
                    Qt.openUrlExternally(link);
                }
            } }
        }

        Text {
            x: 16; y: 960; width: root.width - 32
            text: "Harpoon opens with this repository pre-filled — confirm there to install."
            color: "#8ea1b5"; font.pixelSize: 18; wrapMode: Text.Wrap
        }

        // edge-swipe back
        MouseArea {
            x: 0; y: 0; width: 90; height: parent.height
            property real startX: 0
            onPressed: { startX = mouseX; }
            onReleased: { var dx = mouseX - startX; if (dx > 150) { appDetailPage.visible = false; catListPage.visible = true } }
        }
    }
}
