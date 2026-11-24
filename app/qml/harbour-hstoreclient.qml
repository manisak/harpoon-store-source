import QtQuick 2.2

Rectangle {
    id: root
    color: "#10141b"
    anchors.fill: parent

    property string storeUrl: "https://harpoon-store.manisak.com/api/apps.json"
    property string appStatus: "loading…"
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
                    var obj = JSON.parse(xhr.responseText);
                    var cur = activeCat;
                    catModel.clear();
                    catModel.append({ slug: "", name: "All", count: 0 });
                    for (var i = 0; i < obj.categories.length; i++) catModel.append(obj.categories[i]);
                    for (var j = 0; j < catModel.count; j++) {
                        var c = catModel.get(j);
                        if (c.slug === cur) { catModel.setProperty(j, "sel", true); }
                        else catModel.setProperty(j, "sel", false);
                    }
                } catch (e) { appStatus = "CatParse error: " + e; }
            }
        };
        xhr.send();
    }

    function loadApps() {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", storeUrl + "/api/apps.json" + (activeCat !== "" ? "?cat=" + activeCat : ""), true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    try {
                        var obj = JSON.parse(xhr.responseText);
                        listModel.clear();
                        for (var i = 0; i < obj.apps.length; i++) {
                            var a = obj.apps[i];
                            var r = a.rating > 0 ? (" - ★ " + Number(a.rating).toFixed(1)) : "";
                            listModel.append({ appId: a.id, appName: a.name + r, appCat: a.category, appRepo: a.repo_url, appDesc: a.description, appVer: a.current_version, appRating: a.rating, appRatings: a.ratings });
                        }
                        appStatus = "";
                    } catch (e) { appStatus = "Parse error: " + e; }
                } else { appStatus = "Store not reachable (HTTP " + xhr.status + ")"; }
            }
        };
        xhr.send();
    }

    function applyCat(slug) {
        activeCat = slug;
        loadApps();
        for (var i2 = 0; i2 < catModel.count; i2++) {
            var c = catModel.get(i2);
            if (c.slug !== slug) catModel.setProperty(i2, "sel", false);
        }
    }

    Text { x: 12; y: 8; text: "⚓ Harpoon Store"; color: "#f2953c"; font.pixelSize: 34 }

    Column {
        x: 10; y: 60; width: parent.width - 20; spacing: 6
        // Kategorien von oben nach unten
        Repeater {
            model: catModel
            Rectangle {
                color: sel ? "#f2953c" : "#2a333d"
                radius: 8
                height: 56; width: 380
                Text { x: 16; anchors.verticalCenter: parent.verticalCenter; text: name + "  (" + count + ")"; color: sel ? "#10141b" : "#e0e6ec"; font.pixelSize: 22 }
                MouseArea { anchors.fill: parent; onClicked: { applyCat(slug); for (var i = 0; i < catModel.count; i++) { var c = catModel.get(i); catModel.setProperty(i, "sel", c.slug === slug); } } }
            }
        }
    }

    Text { text: appStatus; color: "#ffb36b"; font.pixelSize: 24; anchors.centerIn: parent }

    ListView {
        x: 0; y: 0; width: 0; height: 0
        model: listModel
        visible: false
    }

    ListView {
        id: appListTop
        anchors.top: parent.top; anchors.left: parent.left; anchors.right: parent.right
        y: 520
        height: parent.height - 520
        width: parent.width
        x: 0
        model: listModel
        clip: true
        delegate: Item {
            width: appListTop.width
            height: 100
            Text { text: appName; color: "#f2953c"; font.pixelSize: 28; x: 16; y: 10 }
            Text { text: appCat; color: "#8ea1b5"; font.pixelSize: 18; x: 16; y: 60 }
            Text { text: appVer ? ("v" + appVer) : ""; color: "#8ea1b5"; font.pixelSize: 18; x: 380; y: 10 }
            Rectangle { color: "#2a333d"; height: 1; width: parent.width; y: 96 }
            MouseArea {
                anchors.fill: parent
                onClicked: {
                    showDetail = true;
                    detailData = { name: appName, description: appDesc, repo_url: appRepo, category: appCat, current_version: appVer, rating: appRating, ratings: appRatings };
                }
            }
        }
    }
    
    Rectangle {
        id: detailOverlay
        visible: showDetail
        color: "#10141b"
        anchors.fill: parent

        Text { text: showDetail && detailData ? "← " + detailData.name : ""; color: "#f2953c"; font.pixelSize: 36; x: 90; y: 16 }
        MouseArea { x: 16; y: 10; width: 60; height: 60; onClicked: { showDetail = false; detailData = null } }
        Text {
            x: 16; y: 120; width: parent.width - 32
            text: showDetail && detailData ? (detailData.category + (detailData.current_version ? "  ·  current version: " + detailData.current_version : "")) : ""
            color: "#8ea1b5"; font.pixelSize: 20
        }
        Text {
            x: 16; y: 170
            text: showDetail && detailData ? (detailData.rating > 0 ? "★ " + Number(detailData.rating).toFixed(1) + " / 5 (" + detailData.ratings + " ratings)" : "No ratings yet") : ""
            color: "#ffd08a"; font.pixelSize: 24
        }
        Text {
            x: 16; y: 220; width: parent.width - 32
            text: showDetail && detailData ? detailData.description : ""
            color: "#e0e6ec"; font.pixelSize: 22; wrapMode: Text.Wrap
        }
        Text {
            x: 16; y: 700; width: parent.width - 32
            text: showDetail && detailData ? "Repository:\n" + detailData.repo_url : ""
            color: "#8ea1b5"; font.pixelSize: 20; wrapMode: Text.Wrap
        }
        Rectangle {
            x: 16; y: 820; color: "#f2953c"; radius: 12; width: 520; height: 80
            Text { color: "#10141b"; font.pixelSize: 30; font.bold: true; anchors.centerIn: parent; text: "⚓ Install with Harpoon" }
            MouseArea {
                anchors.fill: parent
                onClicked: { if (detailData) Qt.openUrlExternally("harpoon://add?url=" + encodeURIComponent(detailData.repo_url)); }
            }
        }
        Text {
            x: 16; y: 940; width: parent.width - 32
            text: "Tap 'Install with Harpoon': Harpoon opens with this repository pre-filled — confirm there to install."
            color: "#8ea1b5"; font.pixelSize: 18; wrapMode: Text.Wrap
        }
    }
}
