{:ns samsara-api.core
 :require [[element.core :as el :src "https://raw.githubusercontent.com/fofx-software/element/master/core.cmp.clj"]]}

(el/set-props el/body {"innerHTML" "Hello World!"})

(append-child el/head
  ["script" {"src" "https://unpkg.com/xlsx@0.14.2/dist/xlsx.full.min.js"}])

(defn access-token
  []
  (aget js/window "accessToken"))

(defn last-result
  []
  (aget js/window "lastResult"))
