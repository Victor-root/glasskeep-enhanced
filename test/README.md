# Tests

Trois commandes, selon ce qu'on veut savoir.

```sh
npm test                   # une demi-seconde, aucun serveur, aucun port
npm run test:functional    # une minute, une instance par scénario
npm run test:integration   # quelques minutes, tout, y compris la fédération
```

## `npm test`

Les vérifications qui tiennent dans une fonction: pas de serveur, pas de
réseau, pas de base de données, rien à nettoyer après. Assez rapide pour
être lancé avant chaque commit, et c'est bien l'intention.

| Ce qui est vérifié | Où |
|---|---|
| L'assainissement est la dernière étape avant chaque affichage de HTML | `invariants/t16-sanitize-before-display.mjs` |
| Quelles adresses ont le droit de réécrire l'adresse d'appel retenue | `federation/t7-trust-policy.mjs` |
| Adresses IA autorisées, certificat exigé par les scripts, domaine des passkeys, filtre de style, sceau du chiffrement, freinage de la connexion | `unit/t18-pure-rules.mjs` |
| Un refus 401 sur une route sans jeton ne détruit pas la session ouverte | `unit/t19-unauthenticated-401.mjs` |

Le premier mérite un mot: ce n'est pas le test d'une fonction, c'est le
test d'une règle. Il recense chaque endroit où l'interface affiche du
HTML brut et vérifie que la valeur descend d'un nettoyeur. Il casse le
jour où quelqu'un ajoute un affichage alimenté directement par le contenu
d'une note, ce qui est exactement le scénario que l'audit avait laissé
sans garde-fou.

## `npm run test:functional`

Les précédents vérifient que l'application refuse ce qu'elle doit
refuser. Ceux-ci vérifient qu'elle fait ce qu'elle promet, ce qui n'est
pas la même question: une note créée se relit à l'identique, une
corbeille se vide, un partage donne exactement les droits annoncés, un
rappel sonne, un réglage revient après reconnexion.

Chaque scénario démarre sa propre instance, sur son propre port et sa
propre base temporaire, et nettoie derrière lui. Rien n'est partagé,
donc l'ordre d'exécution n'a aucune importance et un scénario qui
échoue ne contamine pas les suivants.

| Ce qui est vérifié | Où | Port |
|---|---|---|
| Le cycle de vie d'une note: types, images, couleur, épinglage, corbeille, archives, écriture en retard | `functional/f1-notes.mjs` | 9511 |
| Étiquettes, export, import et ce qu'un aller-retour de sauvegarde préserve | `functional/f2-etiquettes-import-export.mjs` | 9512 |
| Partage entre deux comptes: droits réels, lecture seule, retrait, cloisonnement | `functional/f3-collaboration.mjs` | 9513 |
| Profil, avatar, réglages et leur synchronisation entre onglets, rappels, notifications, changement de mot de passe | `functional/f4-compte-reglages-rappels.mjs` | 9514 |
| Panneau d'administration: inscriptions en attente, comptes, garde-fous, réglages d'instance, logos, domaine des passkeys | `functional/f5-administration.mjs` | 9515 à 9518 |

### Éprouvés par mutation

Un test qui passe ne prouve rien tant qu'on n'a pas vérifié qu'il sait
échouer. Chaque promesse tenue par le serveur a donc été cassée une fois,
volontairement, pour vérifier que le bon scénario s'en aperçoit. La liste
des sabotages vit dans `functional/mutations.py`, qui en est la seule
source: la recopier ici garantirait surtout de la voir périmer.

```sh
python3 test/functional/mutations.py
```

Le script annonce son total à la fin (« N/N mutations détectées »). Mieux
vaut le relancer après avoir touché à ces scénarios que de leur faire
confiance sur parole.

Il restaure dans tous les cas les fichiers qu'il modifie, et refuse de
démarrer si l'un d'eux porte des modifications non validées. Une ligne
« NON DÉTECTÉ » désigne un trou dans la couverture; « motif introuvable »
veut dire que le code a bougé et que la mutation est à réécrire.

## `npm run test:integration`

Tout: une autorité de certification locale, deux instances GlassKeep
qui s'appairent réellement en TLS vérifié, les scénarios de sécurité qui
démarrent leurs propres serveurs, puis les scénarios fonctionnels
ci-dessus. Le montage et le démontage sont pris en charge, y compris
quand un scénario échoue.

Demande `openssl`. La partie navigateur d'un scénario se signale ignorée
si aucun Chromium n'est trouvé; on peut en désigner un avec
`GK_CHROMIUM=/chemin/vers/chrome`.

Le détail des scénarios, la façon de les jouer un par un, et le mode
« vulnérable / corrigé » qui sert à vérifier qu'un test détecte
réellement une faille: voir [`federation/README.md`](./federation/README.md).

## Côté Android

```sh
cd android && ./gradlew test
```

Tests JVM, sans appareil ni émulateur. Ils couvrent la règle qui décide
quelles adresses de serveur l'application accepte de joindre sans
chiffrement (`app/src/test/.../CleartextPolicyTest.kt`).

## Ce que ces tests ne font pas

Ils ne remplacent pas un essai à la main. Ils ne couvrent ni les
cérémonies passkey, qui demanderaient un authentificateur, ni l'interface
Android, qui demanderait un appareil. Un scénario qui passe dit que le
chemin testé fonctionne, rien de plus.

Ils s'arrêtent aussi au bord de l'interface: tout passe par l'API, donc
un bouton qui n'appelle plus la bonne route, un écran qui n'affiche pas
ce que le serveur lui envoie ou une mise en page cassée ne feront tomber
aucun de ces tests.
