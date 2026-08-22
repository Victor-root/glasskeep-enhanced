# Tests de fédération, deux instances réelles

Ces scénarios font tourner **deux serveurs GlassKeep** sur la machine locale et
les font s'appairer pour de vrai. Rien n'est simulé: vraie poignée de main,
vrais tickets de santé, vraies signatures, vrai partage de notes.

Pourquoi cette mise en place plutôt qu'un simple `npm run dev`: la fédération
refuse le HTTP en clair et vérifie la chaîne de certification du pair. Il faut
donc une autorité de certification locale et un certificat qu'elle signe. Le
script s'en charge.

Les deux instances écoutent sur `localhost`, à deux ports différents. Le code
de fédération distingue les pairs par origine, et le port en fait partie, donc
cela suffit à en faire deux serveurs distincts. Aucun `/etc/hosts` à modifier.

## Lancer

```sh
npm ci                      # une fois, pour better-sqlite3 et express
test/federation/setup.sh    # CA, certificats, deux instances, comptes
test/federation/run.sh      # joue tous les scénarios
test/federation/teardown.sh # arrête tout et nettoie
```

`setup.sh` repart d'une base vide à chaque fois, donc les scénarios sont
rejouables sans état résiduel. Tout vit dans `test/federation/.lab/`, qui est
ignoré par git.

Variables reconnues: `FEDLAB_PORT_A`, `FEDLAB_PORT_B` (ports), `FEDLAB_DIR`
(emplacement du bac à sable), `FEDLAB_A` / `FEDLAB_B` (adresses complètes,
utiles si vous exposez les instances autrement).

## Les scénarios

| Fichier | Ce qu'il vérifie |
|---|---|
| `t1-baseline.mjs` | L'appairage nominal, de l'invitation au lien en ligne. Garde-fou: s'il casse, un correctif a cassé la fonctionnalité. |
| `t2-attack.mjs` | F-02. Un tiers non authentifié tente d'annuler un appairage en cours et d'injecter une fausse invitation. |
| `t3-uuid-tiebreak.mjs` | La variante dure de F-02 (un identifiant bien formé mais forgé), le bornage du libellé, le plafond par origine, et les invitations réellement croisées. |
| `t4-double-accept.mjs` | Le cas limite du correctif: deux administrateurs qui acceptent en même temps ne doivent produire ni deux liens actifs, ni deux liens bloqués. |
| `t5-notes.mjs` | Non-régression de la fonctionnalité: partage d'une note entre serveurs, édition dans les deux sens, passage en lecture seule, dépairage. |

## Tester avant / après un correctif

`t2` et `t3` prennent une variable d'attente, ce qui permet de vérifier que le
test détecte réellement la faille et ne se contente pas de passer:

```sh
node test/federation/t2-attack.mjs              # attend un serveur VULNÉRABLE
EXPECT=fixed node test/federation/t2-attack.mjs # attend un serveur CORRIGÉ
```

Sur le code antérieur au correctif de F-02, la première commande passe 8/8: le
harnais reproduit bien l'attaque. Sur le code corrigé, c'est la seconde qui
passe.

## Limites

Ces scénarios couvrent la poignée de main d'appairage et le partage de notes.
Ils ne couvrent pas le chiffrement au repos, les passkeys, ni la partie
Android. Un scénario qui passe dit que le chemin testé fonctionne, pas que la
fédération est sans défaut.
