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
| `t6-trust-proxy.mjs` | F-03. Active le chiffrement au repos, verrouille, puis martèle le déverrouillage en changeant `X-Forwarded-For` à chaque essai. Laisse l'instance verrouillée: relancez `setup.sh` ensuite. |
| `t7-trust-policy.mjs` | F-03, la politique elle-même: quelles adresses ont le droit de réécrire l'adresse retenue. Ne demande aucun serveur. |
| `t9-ai-ssrf.mjs` | F-05. Un compte ordinaire ne doit pas pouvoir faire sonder le réseau par le serveur via l'adresse du fournisseur IA, sans casser les deux montages que GlassKeep assume (IA du serveur partagée, ou chacun la sienne). Couvre l'interrupteur admin dans ses deux positions. Démarre son instance et un faux service interne. |
| `t8-plaintext-guard.mjs` | F-04. Le refus d'envoyer la phrase de passe en clair doit s'appliquer au défaut Docker, sans casser les installations qui déclarent un proxy. Démarre ses propres instances en HTTP, n'utilise pas le bac à sable. |
| `t10-login-throttle.mjs` | F-06. Le freinage de la connexion, dans les deux directions: dix mots de passe ratés d'affilée ne doivent rien coûter, un martèlement doit se faire couper. Vérifie aussi que le refus ne dit plus si le compte existe, ni par la phrase ni par le temps de réponse. Démarre sa propre instance. |

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

`t6` se pilote de la même façon, en changeant qui le serveur considère comme un
intermédiaire de confiance:

```sh
# L'appelant n'est pas un intermédiaire de confiance: l'en-tête est ignoré,
# le limiteur mord au bout de 20 essais.
FEDLAB_TRUST_PROXY=10.9.9.9 test/federation/setup.sh
EXPECT=fixed node test/federation/t6-trust-proxy.mjs

# L'appelant EST dans l'ensemble de confiance: son en-tête est honoré et le
# limiteur ne mord jamais. C'est ce que faisait l'ancien réglage pour TOUT
# LE MONDE, y compris un appelant venu d'Internet.
FEDLAB_TRUST_PROXY=loopback test/federation/setup.sh
node test/federation/t6-trust-proxy.mjs
```

## Limites

Le bac à sable tourne entièrement sur la boucle locale, qui fait partie des
intermédiaires de confiance par défaut. On ne peut donc pas y fabriquer un
appelant venant d'Internet: `t6` contourne la difficulté en désignant un
intermédiaire qui n'est pas nous, et `t7` vérifie la politique adresse par
adresse, sans réseau.

Ces scénarios couvrent la poignée de main d'appairage, le partage de notes, le
limiteur de déverrouillage, le freinage de la connexion, le refus du transport
en clair et les adresses sortantes de la configuration IA. Ils ne couvrent pas
les passkeys ni la partie Android. Un scénario qui passe dit que le chemin testé fonctionne, pas que la
fédération est sans défaut.
