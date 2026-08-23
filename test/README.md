# Tests

Deux commandes, selon ce qu'on veut savoir.

```sh
npm test              # une demi-seconde, aucun serveur, aucun port
npm run test:integration   # quelques minutes, deux instances réelles
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

## `npm run test:integration`

La suite complète: une autorité de certification locale, deux instances
GlassKeep qui s'appairent réellement en TLS vérifié, plus les scénarios
qui démarrent leurs propres serveurs. Le montage et le démontage sont
pris en charge, y compris quand un scénario échoue.

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
