import QtQuick 2.2
import Sailfish.Silica 1.0

Rectangle {
    id: root
    color: "#10141b"
    anchors.fill: parent

    property string storeUrl: "https://harpoon-store.manisak.com"
    property string appStatus: ""
    property string activeCat: ""
    property bool showDetail: false
    property var detailData: null

    ListModel { id: catModel }
    ListModel { id: listModel }

    function loadCats() {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", storeUrl + "/api/categories.json", true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
                try {
                    var o = JSON.parse(xhr.responseText);
                    catModel.clear();
                    catModel.append({ slug: "", name: "All", count: 0 });
                    for (var i = 0; i < o.categories.length; i++) catModel.append(o.categories[i]);
                } catch (e) { appStatus = "CatParse " + e; }
            }
        };
        xhr.send();
    }

    function loadApps() {
        appStatus = "loading…";
        var xhr = new XMLHttpRequest();
        xhr.open("GET", storeUrl + "/api/apps.json" + (activeCat ? "?cat=" + activeCat : ""), true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    try {
                        var o = JSON.parse(xhr.responseText);
                        listModel.clear();
                        for (var i = 0; i < o.apps.length; i++) listModel.append({
                            appId: o.apps[i].id, name: o.apps[i].name, description: o.apps[i].description,
                            repoUrl: o.apps[i].repo_url, appCategory: o.apps[i].category, iconUrl: o.apps[i].iconUrl,
                            appRating: o.apps[i].rating, ratingsN: o.apps[i].ratings, currentVersion: o.apps[i].current_version
                        });
                        appStatus = "";
                    } catch (e) { appStatus = "Parse error: " + e; report("loadApps parse " + e); }
                } else { appStatus = "Store not reachable (HTTP " + xhr.status + ")"; report("loadApps http " + xhr.status); }
            }
        };
        xhr.send();
    }

    function selectCat(slug) {
        activeCat = slug;
        loadApps();
        categoryList.visible = false;
        appListPage.visible = true;
    }

    Component.onCompleted: { loadCats(); loadApps(); }

    // alle seiten in einem scroll-flickable (header + kategorien + apps)
    Flickable {
        id: mainScroll
        anchors.fill: parent
        contentHeight: scrollContent.height + 100
        clip: true

        Column {
            id: scrollContent
            spacing: 8
            x: 0; width: root.width

            Text { text: "⚓ Harpoon Store"; color: "#f2953c"; font.pixelSize: 42; x: 16 }

            Rectangle { color: "#2a333d"; height: 2; width: root.width - 32; x: 16 }

            Text { text: "Kategorien"; color: "#8ea1b5"; font.pixelSize: 22; x: 16 }

            // kategorien (vertikal)
            Column { x: 16; width: root.width - 32
                spacing: 6
                Repeater {
                    model: catModel
                    Rectangle {
                        color: root.activeCat === slug ? "#f2953c" : "#2a333d"
                        radius: 8
                        width: parent.width; height: 70
                        Text { x: 18; anchors.verticalCenter: parent.verticalCenter; text: name + "   (" + count + " Apps)"; color: root.activeCat === slug ? "#10141b" : "#e0e6ec"; font.pixelSize: 26 }
                        MouseArea { anchors.fill: parent; onClicked: { root.activeCat = slug; root.loadApps(); categoryListPage.visible = true; } }
                    }
                }
            }

            Rectangle { color: "#2a333d"; height: 2; width: root.width - 32; x: 16 }

            // apps (alle, die mit activeCat gefiltert sind)
            Repeater {
                model: listModel
                Rectangle {
                    width: root.width - 32; height: 110
                    color: index % 2 === 0 ? "transparent" : "transparent"
                    x: 16
                    MouseArea { anchors.fill: parent; onClicked: { detailData = { id: model.appId, name: model.name, description: model.description, repoUrl: model.repoUrl, appCategory: model.appCategory, iconUrl: model.iconUrl, appRating: model.appRating, ratings: model.ratingsN, currentVersion: model.currentVersion }; detailPage.visible = true } }
                    Row {
                        x: 20; y: 8
                        spacing: 14
                        Rectangle {
                            width: 90; height: 90; radius: 14
                            color: "#1c232b"
                            Image {
                                anchors.fill: parent
                                anchors.margins: 6
                                source: model.iconUrl ? ("https://harpoon-store.manisak.com" + model.iconUrl) : ""
                                fillMode: Image.PreserveAspectFit
                                visible: model.iconUrl ? true : false
                            }
                            Text { anchors.centerIn: parent; text: model.name.charAt(0); color: "#f2953c"; font.pixelSize: 40; visible: !model.iconUrl }
                        }
                        Column {
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: 6
                            Text { text: model.name; color: "#f2953c"; font.pixelSize: 30 }
                            Text { text: model.appCategory + (model.currentVersion ? " · v" + model.currentVersion : ""); color: "#8ea1b5"; font.pixelSize: 20 }
                            Text { text: model.appRating > 0 ? ("★ " + model.appRating.toFixed(1)) : ""; color: "#ffd08a"; font.pixelSize: 18 }
                        }
                    }
                }
            }
        }
    }

    // app status label (in der mitte wenn keine apps geladen)
    Text { text: appStatus; color: "#ffb36b"; font.pixelSize: 24; anchors.centerIn: parent; visible: appStatus === "loading…" || (appStatus !== "" && appStatus !== "" && listModel.count === 0 && appStatus.indexOf('ok') === -1) }

    // ===== Kategorien-Liste-Seite (nach Tap auf Rubrik) =====
    Rectangle {
        id: categoryListPage
        visible: false
        color: "#10141b"
        anchors.fill: parent

        Text { text: "⚓ " + root.activeCat; color: "#f2953c"; font.pixelSize: 40; x: 180; y: 16 }

        Rectangle {
            x: 16; y: 16
            color: "#2a333d"; radius: 10; width: 140; height: 64
            Text { anchors.centerIn: parent; text: "← Back"; color: "#f2953c"; font.pixelSize: 26 }
            MouseArea { anchors.fill: parent; onClicked: categoryListPage.visible = false }
        }

        ListView {
            model: listModel
            anchors.fill: parent
            anchors.topMargin: 110
            clip: true
            delegate: Rectangle {
                width: parent.width
                height: 120
                color: "transparent"
                MouseArea { anchors.fill: parent; onClicked: { detailData = { id: model.appId, name: model.name, description: model.description, repoUrl: model.repoUrl, appCategory: model.appCategory, iconUrl: model.iconUrl, appRating: model.appRating, ratings: model.ratingsN, currentVersion: model.currentVersion }; detailPage.visible = true } }
                Row {
                    x: 12; y: 10
                    spacing: 14
                    Rectangle {
                        width: 90; height: 90; radius: 14
                        color: "#1c232b"
                        Image { anchors.fill: parent; anchors.margins: 6; source: model.iconUrl ? ("https://harpoon-store.manisak.com" + model.iconUrl) : ""; fillMode: Image.PreserveAspectFit; visible: model.iconUrl ? true : false }
                        Text { anchors.centerIn: parent; text: model.name.charAt(0); color: "#f2953c"; font.pixelSize: 40; visible: !model.iconUrl }
                    }
                    Column { anchors.verticalCenter: parent.verticalCenter
                        spacing: 6
                        Text { text: model.name; color: "#f2953c"; font.pixelSize: 28 }
                        Text { text: model.appCategory + (model.currentVersion ? " · v" + model.currentVersion : ""); color: "#8ea1b5"; font.pixelSize: 18 }
                    }
                }
            Rectangle { color: "#2a333d"; height: 1; width: parent.width; y: 116 }
            }
        }
    }

    // ===== Detail-Overlay =====
    Rectangle {
        id: detailPage
        visible: false
        color: "#10141b"
        anchors.fill: parent

        Rectangle {
            x: 16; y: 16
            color: "#2a333d"; radius: 10; width: 140; height: 64
            Text { anchors.centerIn: parent; text: "← Back"; color: "#f2953c"; font.pixelSize: 26 }
            MouseArea { anchors.fill: parent; onClicked: detailPage.visible = false }
        }

        Text { text: detailData ? "⚓ " + detailData.name : ""; color: "#f2953c"; font.pixelSize: 38; x: 180; y: 22; width: root.width - 300; wrapMode: Text.Wrap }

        Row {
            x: 16; y: 120
            spacing: 16
            Rectangle {
                width: 110; height: 110; radius: 14
                color: "#1c232b"
                Image { anchors.fill: parent; anchors.margins: 6; source: detailData && detailData.iconUrl ? ("https://harpoon-store.manisak.com" + detailData.iconUrl) : ""; fillMode: Image.PreserveAspectFit }
                Text { anchors.centerIn: parent; text: detailData && detailData.name ? detailData.name.charAt(0) : "?"; color: "#f2953c"; font.pixelSize: 40 }
            }
            Column {
                anchors.verticalCenter: parent.verticalCenter
                spacing: 8
                Text { text: detailData ? detailData.appCategory : ""; color: "#8ea1b5"; font.pixelSize: 20 }
                Text { text: detailData && detailData.appRating > 0 ? ("★ " + Number(detailData.appRating).toFixed(1) + " (" + detailData.ratings + ")") : "No ratings yet"; color: "#ffd08a"; font.pixelSize: 22 }
                Text { text: detailData && detailData.currentVersion ? ("v" + detailData.currentVersion) : ("latest"); color: "#8ea1b5"; font.pixelSize: 20 }
            }
        }

        Text { x: 16; y: 260; width: root.width - 32; text: detailData ? detailData.description : ""; color: "#e0e6ec"; font.pixelSize: 22; wrapMode: Text.Wrap; textFormat: Text.PlainText }

        Text { x: 16; y: 700; width: root.width - 32; text: detailData ? "Repository:\n" + detailData.repoUrl : ""; color: "#8ea1b5"; font.pixelSize: 20; wrapMode: Text.Wrap }

        Rectangle {
            x: 16; y: 840; color: "#f2953c"; radius: 12; width: root.width - 32; height: 90
            Text { color: "#10141b"; font.pixelSize: 30; font.bold: true; anchors.centerIn: parent; text: "⚓ Install with Harpoon" }
            MouseArea { anchors.fill: parent; onClicked: { if (detailData) Qt.openUrlExternally("harpoon://add?url=" + encodeURIComponent(detailData.repoUrl)); } }
        }

        Text {
            x: 16; y: 980; width: root.width - 32
            text: "Harpoon opens with this repository pre-filled — confirm there to install."
            color: "#8ea1b5"; font.pixelSize: 18; wrapMode: Text.Wrap
        }
    }
}
