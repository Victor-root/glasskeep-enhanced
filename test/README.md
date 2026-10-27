# Tests

Trois commandes, selon ce qu'on veut savoir.

```sh
npm test                   # une demi-seconde, aucun serveur, aucun port
npm run test:functional    # une minute, une instance par scénario
npm run test:integration   # quelques minutes, tout, y compris la fédération
npm run test:rollback -- <dossier de la version stable>   # une bêta, puis la stable sur la même base
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
| Une copie du serveur n'écrase pas une modification locale commencée pendant qu'on l'appliquait | `unit/t20-local-edit-race.mjs` |
| L'écran TV garde un seul écouteur de retour au premier plan et le retire en se fermant | `unit/t21-tv-refresh-listeners.mjs` |
| Une liste à cocher propose de reprendre un élément coché plutôt que d'en créer un doublon | `unit/t22-checklist-suggestions.mjs` |
| L'IA renvoie une demande sans le paramètre qu'un modèle refuse (max_tokens, température) et s'en souvient | `unit/t23-ai-refused-parameters.mjs` |
| Les versions bêta se rangent comme le veut semver et une bêta est étiquetée avec son commit | `unit/t24-update-versions.mjs` |
| La base est copiée à chaque changement de version, refusée par une version trop ancienne, et la sauvegarde d'avant la bêta n'est restaurée que par la version visée | `unit/t25-db-safety.mjs` |
| Le canal stable ou bêta propose la bonne version, n'installe que ce qu'il propose, et quitter une bêta respecte la compatibilité de la base | `unit/t26-update-channel.mjs` |
| Une mise à jour Docker qui échoue remet la base copiée par la nouvelle version avant de la migrer, et seulement celle-là | `unit/t27-update-rollback-db.mjs` |
| Deux listes du même type qui se touchent dans une note n'en font plus qu'une, des types différents restent séparés, et dans le vrai éditeur Retour arrière fusionne puis un seul Ctrl+Z défait (issue #35) | `unit/t28-join-adjacent-lists.mjs` |
| Le texte d'une note hors de l'éditeur: import Google Keep, anciennes notes en Markdown, mode lecture, aperçu des cartes, note vide ou pas (mise à la corbeille en fermant), conversion en liste à cocher et retour sans perdre coches ni sections, copie vers le Bloc-notes et depuis le mode lecture | `unit/t29-rich-text-conversions.mjs` |
| Les gestes du vrai éditeur: retirer une couleur sans toucher aux autres styles, indenter un élément de liste, bloc de code sur quelques mots ou plusieurs lignes, soulignements variés, cases cochées, collage depuis le Bloc-notes ou en « texte seul » (liens compris), copie d'une liste | `unit/t30-rich-text-editor.mjs` |

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
| Connexion OpenID Connect avec un faux fournisseur: interrupteur de l'administrateur et ses deux politiques, fournisseur de l'instance associé par plusieurs comptes, fournisseur déclaré par chaque compte et secret qui ne ressort jamais, adresse privée refusée à un compte ordinaire tant que le réseau local n'est pas ouvert, association (une par compte), connexion par identifiant, identité tenue par issuer + sub, refus (autre identité, autre adresse, autre navigateur, ticket ou état rejoué, jeton falsifié, nonce faux, politique changée en cours de route), mise à jour d'une base antérieure aux politiques | `functional/f6-sso.mjs` | 9519, 9520, 9521 |
| Le script de mise à jour native dans un bac à sable: bêta installée par son commit (même à numéro égal) et étiquetée avec lui, bêta déjà en place non retéléchargée, retour d'une bêta vers une version publiée, commit invalide, introuvable ou au mauvais numéro sans dégât, base d'avant remise quand la nouvelle version l'a convertie puis échoue | `functional/f7-mise-a-jour-native.mjs` | aucun |

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

## `npm run test:rollback`

Le test de retour en arrière, que le workflow `beta.yml` joue avant de
publier chaque bêta. Une bêta remplit une base (texte riche, liste avec
sections et retraits, étiquettes, images, icône, archive, corbeille,
rappel, partage, réglages), la dernière version stable la rouvre et doit
tout rendre à l'identique, ce qu'elle modifie se retrouve ensuite dans la
bêta, et la base de la bêta doit garder toutes les tables et colonnes
d'une base stable neuve. Le cache du navigateur ne doit pas changer de
format.

Quand la bêta déclare un format de base plus récent
(`glasskeep.dbCompat` dans `package.json`), le retour en arrière est
annoncé comme impossible: le test vérifie seulement que la version stable
refuse la base au lieu de l'abîmer.

Il demande une copie de la version stable, dépendances installées:

```sh
git worktree add --detach ../stable v2.7.0 && (cd ../stable && npm ci)
npm run test:rollback -- ../stable
```

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
