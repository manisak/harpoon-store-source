// Main page of the Harbour HStore client (pure QML, launched via sailfish-qml)
import QtQuick 2.2
import Sailfish.Silica 1.0

ApplicationWindow {
    id: appWindow

    property string storeUrl: "https://harpoon-store.manisak.com"
    property string appsJson: ""

    initialPage: Component { FirstPage { } }

    function loadApps() {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", storeUrl + "/api/apps.json", true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    try {
                        appsJson = xhr.responseText
                        var obj = JSON.parse(xhr.responseText)
                        listModel.clear()
                        for (var i = 0; i < obj.apps.length; i++) listModel.append(obj.apps[i])
                        loadingLabel.visible = false
                    } catch (e) { loadingLabel.text = "Parse error" }
                } else loadingLabel.text = "Store not reachable (HTTP " + xhr.status + ")"
            }
        }
        xhr.send()
    }
}
