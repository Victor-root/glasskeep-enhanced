# Registre de vérification fp-check

Trace complète de la vérification appliquée à chaque faille candidate de l'audit
de `feature/cross-server-collaboration` (révision `531e500`). Ce document est le
justificatif du rapport : il expose la méthode et les objections, y compris
celles qui ont fait tomber une revendication.

## Méthode

Sept phases par candidat.

1. Flux de données : source, puits, frontières de confiance franchies, contrats
   d'API, protections d'environnement, motifs comparables ailleurs.
2. Exploitabilité : contrôle réel de l'attaquant, bornes chiffrées, concurrence,
   analyse adverse.
3. Impact : sécurité réelle contre robustesse opérationnelle, contrôle primaire
   contre défense en profondeur.
4. Démonstration : pseudo-code, exécutable ou saut justifié, démonstration
   négative, vérification que les démonstrations prouvent bien la faille.
5. Revue adverse : treize questions de contestation.
6. Grille de portes : Processus, Atteignabilité, Impact réel, Validité de la
   démonstration, Bornes, Environnement.
7. Verdict.

### Les treize questions de la revue adverse

1. La revendication reste-t-elle cohérente une fois reformulée précisément ?
2. Une validation en amont rend-elle le chemin inatteignable ?
3. Le code appelant contraint-il déjà l'entrée ?
4. Le motif est-il sûr ailleurs dans le même dépôt, et pourquoi pas ici ?
5. Le langage ou l'exécution absorbent-ils le problème ?
6. Une protection d'environnement supprime-t-elle l'effet ?
7. L'attaquant contrôle-t-il vraiment la valeur, ou seulement une partie ?
8. Les bornes chiffrées tiennent-elles au recalcul ?
9. La condition de concurrence est-elle réellement atteignable ?
10. L'impact décrit relève-t-il de la sécurité ou de la robustesse ?
11. Le contrôle visé est-il primaire ou de défense en profondeur ?
12. La démonstration prouve-t-elle la faille ou seulement le comportement ?
13. Un attaquant y gagne-t-il quelque chose qu'il n'a pas déjà ?

### Notation des portes

`OK` la porte passe, `ÉCHEC` elle ne passe pas, `n/a` sans objet.

---

## F-01 Compte administrateur par défaut

**Phase 1.** Source : les littéraux `ADMIN_EMAIL` et `ADMIN_PASSWORD` de
`docker-compose.yml:35-36`, qui sont de la configuration vivante consommée par
le conteneur et non un commentaire. Chemin : `docker/entrypoint.sh:76-79` lance
l'amorçage dès que les deux variables sont non vides, `docker/bootstrap-admin.js:34-39`
vérifie que la table est vide, `:41` hache le littéral, `:43-47` insère le compte
avec `is_admin = 1`. Puits : la comparaison de mot de passe en `server/index.js:1973`
puis l'émission du jeton en `:1976`. Frontière franchie : réseau anonyme vers
session administrateur. Contrat d'API : `/api/login` est public par nécessité.
Protections d'environnement : aucune. Le drapeau `must_change_password` existe
mais sa migration le pose à 0 (`server/index.js:327`) et l'amorçage ne l'écrit
jamais, si bien que la réponse de connexion annonce `false` et que le client ne
demande rien. Références croisées : `install.sh:1046-1091` couvre le même besoin
par une saisie interactive, ce qui prouve que le projet sait faire autrement.

**Phase 2.** Contrôle attaquant total, il fournit l'intégralité du corps de la
requête et le secret est de taille 1. Bornes sans objet. Concurrence sans objet,
le chemin est séquentiel. Analyse adverse : la seule voie de réfutation serait
qu'un mécanisme force la rotation ; il n'y en a aucun, ni côté serveur ni côté
client.

**Phase 3.** Impact de sécurité réel, pas de robustesse. Le contrôle atteint est
l'authentification elle-même, donc primaire. Aggravation : le jeton porte
`is_admin`, ce qui ouvre la route de mise à jour en `server/routes/selfUpdateRoutes.js:493`,
laquelle pilote le moteur Docker de l'hôte via le montage de
`docker-compose.yml:115`. Les identifiants par défaut deviennent un contrôle de
la machine.

**Phase 4.** Pseudo-code : `POST /api/login {"email":"admin","password":"admin"}`,
récupérer le jeton, appeler une route administrateur. Exécutable sauté, faute
d'une instance déployée dans l'environnement d'audit. Démonstration négative :
le chemin `install.sh` demande le mot de passe, aucun compte par défaut n'est
créé. Vérification : la démonstration positive prouve la faille, la négative en
délimite le périmètre à l'installation Docker.

**Phase 5.** Objections 1 à 6 sans effet, il n'y a ni validation en amont, ni
contrainte appelante, ni absorption par le langage, ni protection
d'environnement. Question 4 productive : le motif est sûr dans `install.sh`,
ce qui a permis d'écarter ce chemin. Questions 7 et 8 sans objet. Question 9
sans objet. Questions 10 et 11 : sécurité, contrôle primaire. Question 12 : la
démonstration prouve la faille. Question 13 : l'attaquant part de rien et
obtient l'administration, puis l'hôte.

**Phase 6.** Processus OK. Atteignabilité OK. Impact réel OK. Validité de la
démonstration OK. Bornes n/a. Environnement OK, le déploiement Docker documenté
est le cas nominal.

**Verdict initial : vrai positif, critique.** Corroboré indépendamment par
l'audit des défauts non sûrs, qui le classe critique dans deux catégories.

### Révision de F-01 après contestation

Le mainteneur a contesté la sévérité en objectant que personne ne laisse un mot
de passe par défaut. La contre-vérification lui donne raison, et pour une raison
plus forte que celle qu'il avançait.

*Ce que la vérification initiale a manqué.* La phase 1 exige la cartographie des
protections d'environnement. Elle a été conduite sur le fichier compose et sur
la chaîne d'amorçage, sans jamais ouvrir le mode d'emploi. Or `README.md:203-204`
et `:230-231`, ainsi que les deux autres procédures de déploiement, ne renvoient
pas vers le `docker-compose.yml` du dépôt : elles font coller un bloc portant
`your-admin-username` et `choose-a-strong-password`, précédé en `:218` de la
consigne « Edit the ADMIN_EMAIL and ADMIN_PASSWORD values below ». Aucune
procédure documentée ne conduit à `admin`/`admin`. La documentation d'installation
est une protection d'environnement au sens de la phase 1, et elle n'a pas été
lue.

*Ce qui subsiste.* Le fichier du dépôt porte bien des identifiants fonctionnels,
non commentés. Qui clone le dépôt et lance `docker compose up` dedans obtient le
compte. C'est une population réelle mais étroite, et qui a contourné la
documentation existante. Le second volet, `must_change_password` jamais posé par
l'amorçage, est indépendant du mot de passe et subsiste tel quel, mais sa portée
se réduit à un opérateur qui laisserait le placeholder du README en place.

*Portes révisées.* Processus OK. Atteignabilité OK mais sur un chemin non
documenté, ce qui est la révision décisive. **Impact réel abaissé**, la
population touchée ne suit pas la procédure d'installation. Démonstration OK.
Bornes n/a. **Environnement ÉCHEC pour la revendication large**, le README
neutralise le chemin nominal.

*Question 6 de la revue adverse, reprise.* « Une protection d'environnement
supprime-t-elle l'effet ? » Répondue « aucune » au premier passage. La bonne
réponse est oui pour le chemin nominal. C'est la question qui aurait dû faire
tomber la revendication, et l'erreur porte sur son exécution, pas sur la
méthode.

*Leçon de méthode.* Deux outils indépendants ont convergé sur « critique »,
cette vérification et l'audit des défauts non sûrs. Ils partageaient le même
angle mort : lire un fichier de configuration sans son mode d'emploi. La
convergence a été traitée comme une corroboration alors qu'elle ne l'était pas.

**Verdict révisé : vrai positif étroit, faible.**

---

## F-02 Appairage fédéré annulable et usurpable

**Phase 1.** Source : le corps JSON anonyme de `POST /api/federation/pair/invite`,
déstructuré en `server/routes/federationRoutes.js:251`. Puits : les écritures
`store.setStatus` et `store.insert` de `server/federation/store.js:75,118-137`,
plus l'affichage administrateur. Frontière : aucune n'est franchie, la route est
volontairement pré-authentification puisque les deux serveurs ne partagent
encore aucun secret. Contrat d'API : le seul contrôle est la véracité
JavaScript des champs en `:253`. Protections d'environnement : aucun limiteur de
débit dans tout le projet, aucun `helmet`, et le garde de verrouillage au repos
est monté en `server/index.js:1839`, après l'enregistrement des routes de
fédération en `:1780`, donc il ne s'applique jamais ici. Références croisées :
`/pair/accept:325` et `/pair/refused:365` partagent la conception non signée.

**Phase 2.** Contrôle total sur `linkId`, `nonce` et `initiatorLabel`, contraint
sur `initiatorBaseUrl` qui doit se normaliser en origine HTTPS. Bornes : la
branche d'annulation s'exécute quand `ours.id >= linkId` ; l'identifiant local
est un UUID dont le premier caractère appartient à `0-9a-f`, donc un `linkId`
valant `"!"` (0x21) est strictement inférieur à tout UUID et déclenche
l'annulation avec une probabilité de 1, en une requête. L'égalité est
inatteignable, un identifiant identique sort plus tôt en `:260`. Concurrence
sans objet : le gestionnaire est entièrement synchrone et la liaison SQLite est
synchrone, donc la séquence lecture puis écriture est atomique vis-à-vis des
autres requêtes. Analyse adverse : aucun type n'est contrôlé, un nombre passe et
se stocke avec une affinité texte qui désynchronise les recherches ultérieures,
un objet lève une erreur de liaison et produit une réponse 500 ; le plafond de
500 ne compte que les invitations non traitées ; une barre oblique dans
l'identifiant rend la ligne insupprimable depuis l'interface, les appels client
n'encodant pas le paramètre.

**Phase 3.** Impact de sécurité réel. Le contrôle primaire annoncé par la
conception, à savoir que l'administrateur reconnaisse l'adresse, est défait sur
le chemin du bandeau de notification, qui affiche le nom fourni par l'appelant
sans l'adresse réelle. Le chemin du panneau, lui, affiche bien l'adresse et
conserve le contrôle. S'ajoute une privation de service durable de tout le
sous-système d'appairage.

**Phase 4.** Pseudo-code : une requête portant `{"linkId":"!","nonce":"x",
"initiatorBaseUrl":"https://pair-legitime","initiatorLabel":"pair-legitime"}`.
Exécutable sauté, faute d'une seconde instance GlassKeep. Démonstration
négative : un `linkId` se classant après l'UUID renvoie 409 et ne change rien,
ce qui invalide la formulation initiale. Vérification : la démonstration
positive prouve l'annulation, la négative corrige le mécanisme.

**Phase 5.** Question 1 productive, la reformulation a révélé l'inversion du
sens de comparaison. Question 2 : la seule validation est la véracité, elle ne
bloque rien. Question 3 : il n'y a pas d'appelant, l'entrée vient du réseau.
Question 4 : le projet contraint bien à 24 caractères le nom adopté lors du
sondage de santé en `server/federation/peer.js:297`, mais pas celui de
l'invitation, ce qui montre que le réflexe existe et n'a pas été appliqué ici.
Question 5 : la comparaison de chaînes JavaScript est précisément ce qui rend
l'attaque déterministe. Question 6 : aucune. Question 7 : contrôle total.
Question 8 : la preuve d'ordre lexicographique tient au recalcul. Question 9 :
sans objet. Question 10 : sécurité. Question 11 : primaire sur le chemin du
bandeau. Question 12 : la démonstration prouve la faille. Question 13 : oui, un
inconnu obtient une capacité de blocage et une voie de vol de secret.

**Phase 6.** Processus OK. Atteignabilité OK, pré-authentification et hors du
garde de verrouillage. Impact réel OK. Validité de la démonstration OK. Bornes
OK, probabilité 1. Environnement OK.

**Verdict : vrai positif, élevé.**

---

## F-03 Anti-brute-force du déverrouillage contournable

**Phase 1.** Source : l'en-tête `X-Forwarded-For` de la requête. Chemin :
`server/index.js:86-87` pose `app.set("trust proxy", true)`, ce qui fait de
`req.ip` la première entrée de cet en-tête ; `server/routes/unlockRoutes.js:123-133`
en dérive `getClientIp` et `isLocalhost` ; `:240` et `:297` s'en servent comme
clé de comptage ; `server/encryption/runtimeUnlockState.js:83-110` tient le
compteur. Frontière : anonyme vers classe de confiance et vers seau de comptage.
Protections d'environnement : `Dockerfile:64-68` fixe `HTTPS_ENABLED=false`, ce
qui active la confiance au proxy dans toute image Docker. La valeur n'est jamais
recoupée avec `req.socket.remoteAddress`. Références croisées :
`server/routes/passkeyRoutes.js:665,710` emploient la même clé.

**Phase 2.** Contrôle total sur la clé de comptage, y compris derrière un proxy
correctement configuré, puisque la convention nginx ajoute la valeur du client
en tête de liste. Bornes présentes : le coût réel est celui de scrypt à
`N = 2^15` (`server/encryption/instanceVault.js:20,103-110`), soit environ dix à
treize essais par seconde, à comparer au rythme nominal autorisé par le
limiteur, d'où un facteur d'environ 560. La clé de récupération porte 118 bits
et reste hors d'atteinte. Concurrence : une fenêtre entre la vérification en
`:241` et l'enregistrement en `:258` existe mais est redondante, la
sérialisation par scrypt et la rotation d'en-tête la rendant inutile. Analyse
adverse : la sous-revendication selon laquelle annoncer `127.0.0.1` contourne le
contrôle de transport est fausse, ce contrôle étant déjà satisfait par un autre
chemin quand la confiance au proxy est active, et l'en-tête étant ignoré
lorsqu'elle ne l'est pas.

**Phase 3.** Impact de sécurité réel sur un contrôle primaire, la protection de
la clé de chiffrement au repos. S'y ajoute une saturation du serveur, chaque
essai coûtant 32 Mio et bloquant la boucle d'événements.

**Phase 4.** Pseudo-code : boucler sur un dictionnaire en changeant l'en-tête à
chaque essai. Exécutable sauté, il faudrait une instance chiffrée verrouillée.
Démonstration négative : sans confiance au proxy, l'en-tête est ignoré et le
comptage redevient effectif. Vérification : la positive prouve le contournement,
la négative isole la cause.

**Phase 5.** Questions 1 à 6 : aucune ne fait tomber la revendication, la
question 6 confirme au contraire que l'environnement Docker l'aggrave.
Question 7 : contrôle total. Question 8 : les bornes ont été recalculées et
tiennent. Question 9 productive, elle a fait classer la concurrence comme hors
chemin. Question 10 : sécurité. Question 11 : primaire. Question 12 : la
démonstration prouve le contournement du comptage, pas la compromission de la
clé, qui reste conditionnée à la faiblesse de la phrase de passe. Question 13 :
oui, le seul rempart devient le coût de calcul.

**Phase 6.** Processus OK. Atteignabilité OK. Impact réel OK. Validité de la
démonstration OK. Bornes OK. Environnement OK, défaut de l'image Docker.

**Verdict : vrai positif, élevé.** Une sous-revendication réfutée.

---

## F-04 Refus du HTTP en clair inopérant

**Phase 1.** Source : la configuration, non une entrée attaquant. Chemin :
`server/routes/unlockRoutes.js:166-179`, où `operatorDeclaredProxy` renvoie vrai
dès que `TRUST_PROXY=true` ou `HTTPS_ENABLED=false`, ce qui fait renvoyer vrai à
`isSecureRequest` puis à `transportOk`, sans aucune vérification. Puits : le
point d'application en `:218`. Protections d'environnement : `Dockerfile:64-68`
pose la condition d'office. Références croisées : la même paire de variables
gouverne `server/index.js:84` et `server/routes/passkeyRoutes.js:51`.

**Phase 2.** Contrôle attaquant nul sur la configuration, mais position réseau
suffisante pour capter. Bornes sans objet. Concurrence sans objet. Analyse
adverse : le code documente et assume ce compromis ; ce qui le rend signalable
est que l'image Docker transforme un choix éclairé en comportement silencieux,
un opérateur pouvant publier le port sans proxy chiffrant sans jamais être
averti.

**Phase 3.** Impact de sécurité réel, contrôle primaire désactivé. La frontière
qui compte, navigateur vers proxy, n'est pas vérifiée mais supposée.

**Phase 4.** Pseudo-code : capter la requête de déverrouillage sur le lien non
chiffré. Exécutable sauté. Démonstration négative : avec un proxy réellement
chiffrant, l'hypothèse de l'opérateur est vraie et rien n'est exposé.
Vérification : la faille est conditionnée à un déploiement, la démonstration le
reflète.

**Phase 5.** Question 6 productive, c'est l'environnement qui crée le problème.
Question 10 : sécurité, pas robustesse, puisqu'un secret traverse le réseau.
Question 11 : primaire. Question 13 : l'attaquant obtient la phrase de passe, ce
qu'aucun autre chemin ne lui donne. Les autres questions sont sans effet.

**Phase 6.** Processus OK. Atteignabilité OK. Impact réel OK. Validité de la
démonstration OK. Bornes n/a. Environnement OK.

**Verdict : vrai positif, élevé.**

---

## F-05 Requêtes sortantes arbitraires par tout compte connecté

**Phase 1.** Source : le champ `baseUrl` du corps de requête. Deux chemins
d'écriture, `server/ai/aiSettings.js:279-282` pour la sauvegarde utilisateur et
`server/ai/aiRoutes.js:142` pour la surcharge de test, tous deux limités à un
contrôle de type et un retrait d'espaces. Puits : les appels sortants de
`server/ai/openaiCompatibleProvider.js:81,94` et `:155,169`. Frontière :
utilisateur authentifié sans privilège vers la position réseau du serveur.
Contrat d'API : `PUT /api/user/ai/settings` n'exige pas le rôle administrateur.
Protections d'environnement : aucune liste blanche, les redirections sont
suivies, aucun délai d'expiration applicatif. Références croisées : le jumeau
administrateur en `aiSettings.js:175` a le même manque.

**Phase 2.** Contrôle total sur le protocole, l'hôte, le port et le préfixe de
chemin, le suffixe `/chat/completions` restant fixe. Bornes sans objet.
Concurrence sans objet, le repli DNS n'ayant pas d'intérêt en l'absence de liste
blanche. Analyse adverse : la surcharge de test force `enabled:true` et
contourne donc `resolveEffectiveConfig` ainsi que la validation administrateur,
ce qui rend ce chemin plus permissif que celui d'origine. En revanche, la
lecture complète des réponses, l'accès au socket Docker et les services de
métadonnées d'hébergeur se révèlent hors d'atteinte ou fortement dégradés, la
réponse devant avoir la forme attendue pour être restituée.

**Phase 3.** Impact de sécurité réel, sonde semi-aveugle : le code de réponse et
une partie du message d'erreur reviennent toujours. Le contrôle absent est
primaire, il n'existe aucune validation de destination.

**Phase 4.** Pseudo-code : enregistrer une adresse interne puis appeler le test
et lire le code de réponse. Exécutable sauté. Démonstration négative : la route
de conversation reste soumise à l'activation administrateur en
`aiSettings.js:341-346`, ce qui borne le périmètre au chemin de test.
Vérification : conforme.

**Phase 5.** Question 2 productive, elle a révélé que le chemin de test saute la
validation. Question 4 : les autres appels sortants du projet visent des
adresses posées par un administrateur, pas par un utilisateur. Question 7 :
contrôle total sur la destination. Question 12 : la démonstration prouve la
sonde, pas l'exfiltration, d'où la sévérité moyenne. Question 13 : oui, un
compte ordinaire obtient une visibilité sur le réseau interne qu'il n'a pas.

**Phase 6.** Processus OK. Atteignabilité OK. Impact réel OK. Validité de la
démonstration partielle, la sonde est prouvée, la lecture complète ne l'est pas.
Bornes n/a. Environnement OK.

**Verdict : vrai positif, moyen.**

---

## F-06 Absence de limitation sur la connexion

**Phase 1.** Source : le corps de `POST /api/login`. Puits : la comparaison en
`server/index.js:1973` et l'émission du jeton en `:1976`. Canal auxiliaire :
`GET /api/login/profiles` en `:2037-2046`, public. Protections d'environnement :
aucune, la recherche de tout limiteur dans le projet et dans `package.json` est
négative. Références croisées : les routes de déverrouillage et de passkey ont,
elles, un limiteur, ce qui montre que le besoin est connu.

**Phase 2.** Contrôle total sur les trois champs. Bornes présentes : bcrypt à
coût 10 plafonne à une dizaine d'essais par seconde, soit un dictionnaire de dix
mille entrées en environ dix-sept minutes. Concurrence sans objet. Analyse
adverse : les messages distincts en `:1967` et `:1974` étendent l'énumération
aux comptes masqués de l'écran d'accueil ; la liste publique des profils est en
revanche un choix assumé, atténué par la valeur par défaut à 0 en `:324`.
Constat annexe : l'inscription en `:1900` n'impose aucune longueur minimale,
alors que le changement de mot de passe en exige six en `:2189-2190`.

**Phase 3.** Impact de sécurité réel. Le contrôle absent, le verrouillage après
échecs, est primaire. L'énumération relève de la divulgation.

**Phase 4.** Pseudo-code : boucler sur un dictionnaire. Exécutable sauté.
Démonstration négative : un compte masqué n'apparaît pas dans la liste publique,
ce qui borne l'énumération à la voie des messages d'erreur. Vérification :
conforme.

**Phase 5.** Question 4 productive, le projet limite ailleurs mais pas ici.
Question 8 : les bornes ont été recalculées. Question 10 : sécurité.
Question 11 : primaire pour le verrouillage, divulgation pour l'énumération.
Question 13 : oui, le coût d'une attaque par dictionnaire devient dérisoire.

**Phase 6.** Toutes les portes passent.

**Verdict : vrai positif, moyen.**

---

## F-07 HTTP en clair dans l'application Android

**Phase 1.** Source : le choix d'adresse par l'utilisateur en
`android/.../ui/SetupScreen.kt:245`, qui accepte `http://` sans avertissement.
Chemin : `AndroidManifest.xml:58` lève le blocage système, aucun fichier de
configuration réseau n'existe pour restreindre par domaine. Puits :
`android/.../reminders/ReminderSyncWorker.kt:53,86-95`, qui envoie le jeton
porteur, et la vue web pour le reste. Frontière : réseau local vers session.

**Phase 2.** Contrôle : attaquant en position d'écoute sur le trajet. Bornes
sans objet. Concurrence sans objet. Analyse adverse : la validation des
certificats reste correcte par ailleurs, et la mise à jour de l'application
passe par HTTPS, ce qui exclut l'escalade vers l'installation d'une version
piégée.

**Phase 3.** Impact de sécurité réel mais conditionné au choix de l'utilisateur.
Contrôle primaire, la confidentialité du transport.

**Phase 4.** Pseudo-code : interception sur un réseau partagé, capture du mot de
passe, du jeton et du contenu, puis réutilisation du jeton. Test unitaire sauté
faute de toute infrastructure de test Android, les répertoires correspondants
n'existant pas ; la forme qu'il prendrait est documentée. Démonstrations
négatives : validation TLS saine, mise à jour en HTTPS. Vérification : la
positive prouve l'impact, les négatives bornent le périmètre sans l'annuler.

**Phase 5.** Question 2 productive, l'écran de configuration est le point où une
validation manquerait. Question 6 : Android bloquerait par défaut, c'est
l'application qui lève la protection. Question 10 : sécurité. Question 13 : oui,
identifiants et contenu.

**Phase 6.** Processus OK. Atteignabilité conditionnelle. Impact réel OK.
Validité de la démonstration OK. Bornes n/a. Environnement OK.

**Verdict : vrai positif conditionnel, moyen.**

---

## F-08 Jeton non révoqué au changement de mot de passe

**Phase 1.** Source : un jeton déjà dérobé. Chemin : `server/index.js:803-816`
signe pour trente jours sans identifiant unique ; `:2190-2215` change le mot de
passe et émet un nouveau jeton sans invalider les précédents. Protections
d'environnement : aucune liste de révocation, aucune version de session.

**Phase 2.** Contrôle : celui qui détient le jeton. Bornes sans objet.
Concurrence sans objet. Analyse adverse : deux sous-revendications tombent. Le
retrait des droits d'administrateur est bien pris en compte, les routes
relisant la ligne utilisateur. La suppression du compte coupe l'accès dans
presque tous les cas.

**Phase 3.** Impact de sécurité réel. Le contrôle absent, la révocation de
session, est primaire : c'est le geste que l'utilisateur pose précisément pour
couper un accès.

**Phase 4.** Pseudo-code : conserver un jeton, changer le mot de passe,继续
l'utiliser. Un test d'intégration serait nécessaire, il est sauté faute de
harnais. Démonstrations négatives : la rétrogradation d'administrateur et la
suppression de compte sont bien prises en compte. Vérification : la faille se
limite au changement de mot de passe.

**Phase 5.** Question 1 productive, la reformulation a séparé les trois
sous-revendications. Question 3 : les gestionnaires relisent la ligne
utilisateur pour les droits, mais pas pour la validité du mot de passe.
Question 11 : primaire. Question 13 : oui, l'attaquant conserve un accès que la
victime croit avoir coupé.

**Phase 6.** Processus OK. Atteignabilité OK. Impact réel OK. Validité de la
démonstration partielle. Bornes n/a. Environnement OK.

**Verdict : vrai positif partiel, moyen.**

---

## F-09 à F-21, vérification standard

Ces entrées ont été routées en vérification standard plutôt qu'en cycle complet.
Le routage suit la règle de la méthode : revendication unique et non ambiguë,
composant unique, classe de faille bien comprise, aucune concurrence dans le
déclenchement, flux de données direct de la source au puits. Aucune n'a atteint
un point d'escalade. La grille des six portes est néanmoins évaluée porte par
porte pour chacune, et la revue adverse est reportée en nommant les questions
qui ont produit quelque chose et en marquant les autres sans objet, avec le
motif. Ce report est volontairement compact : dérouler treize questions dont
onze sont sans objet allongerait le document sans rien y ajouter.

Les démonstrations exécutables sont sautées pour le même motif que plus haut :
pas de seconde instance GlassKeep, pas d'appareil Android instrumenté, aucun
harnais de test dans le dépôt. Chaque entrée porte à la place une démonstration
en pseudo-code et, quand la revendication le permettait, une démonstration
négative.

**F-09 — secret partagé accepté sans contrôle de forme.**
`server/routes/federationRoutes.js:325-342`.
*Flux* : source, le corps JSON de `POST /api/federation/pair/accept` ; puits,
`store.activate` puis toute vérification de signature ultérieure. Frontière
franchie : pair vers instance locale. Contrat : seul test en `:326`, la véracité
JavaScript, puis `String(sharedSecret)` en `:342`.
*Exploitabilité* : contrôle total sur `sharedSecret` pour qui tient le rôle
d'acceptant ou a intercepté l'invitation. Bornes : un secret d'un caractère
réduit l'espace de signature à une recherche triviale ; un objet devient
`[object Object]`, constante connue. Concurrence sans objet, gestionnaire
synchrone.
*Impact* : sécurité réelle, le secret est le seul contrôle primaire de toutes
les requêtes serveur à serveur ultérieures.
*Démonstration* : pseudo-code, une acceptation portant `"sharedSecret":"a"`.
Exécutable sauté, pas de seconde instance. Négative : un pair honnête envoie
32 octets d'aléa via `store.newSecret`, donc le défaut ne se manifeste que face
à un pair hostile ou mal implémenté, ce qui borne l'impact sans l'annuler.
*Revue adverse* : question 4 productive, le projet contraint bien la forme
ailleurs, ce qui montre que le réflexe existe. Question 13 productive, un pair
hostile obtient une signature devinable. Questions 1 à 3, 5 à 12 sans objet, la
revendication est directe et sans validation amont à examiner.
*Portes* : Processus OK. Atteignabilité OK, route pré-authentification.
Impact réel OK. Validité de la démonstration OK. Bornes OK. Environnement OK.
**Verdict : vrai positif, moyen. Variante de F-02, même cause racine.**

**F-10 — certificat non vérifié par le script de déverrouillage.**
`scripts/unlock-instance.cjs:135`, `rejectUnauthorized: false`.
*Flux* : source, la phrase de passe saisie par l'administrateur ; puits, la
requête TLS sortante. Frontière franchie : machine de l'administrateur vers le
réseau. Protection d'environnement invoquée par le commentaire : exécution
locale.
*Exploitabilité* : aucun contrôle attaquant sur l'entrée, position réseau requise
sur le trajet. La prémisse du commentaire ne tient pas, l'hôte et le port sont
des paramètres du script. Bornes sans objet. Concurrence sans objet.
*Impact* : sécurité réelle, contrôle primaire, la phrase de passe est la clé de
tout le contenu au repos.
*Démonstration* : pseudo-code, lancer le script contre un hôte distant derrière
un intercepteur présentant un certificat quelconque. Exécutable sauté, pas de
seconde instance. Négative : contre `127.0.0.1`, l'exposition est nulle, ce qui
délimite exactement la condition.
*Revue adverse* : question 3 productive, l'appelant est l'administrateur mais
rien ne contraint la cible. Question 6 productive, la protection d'environnement
annoncée est fausse dans le cas distant. Question 13 productive. Les autres sans
objet.
*Portes* : Processus OK. Atteignabilité OK sous la condition d'usage distant,
nommée. Impact réel OK. Démonstration OK. Bornes sans objet. Environnement OK,
la protection invoquée ne couvre pas le cas.
**Verdict : vrai positif, moyen.**

**F-11 — identité WebAuthn dérivée d'en-têtes clients.**
`server/routes/passkeyRoutes.js:51-88`, point d'application en `:653`.
*Flux* : source, `X-Forwarded-Host` et `X-Forwarded-Proto` ; puits, `rpID` et
`expectedOrigin` passés au vérificateur. Frontière : client vers serveur.
Protection d'environnement : `WEBAUTHN_RP_ID` et `WEBAUTHN_ORIGIN` neutralisent
le défaut, mais ne sont pas posées par défaut.
*Exploitabilité* : contrôle total sur l'en-tête dès que la confiance au proxy est
active, ce qui est le défaut de l'image Docker. Bornes sans objet. Concurrence
sans objet.
*Impact* : la porte d'impact réel a failli faire tomber la revendication,
l'authentificateur liant chaque passkey à un domaine et refusant de la présenter
ailleurs. Ce qui la maintient est plus étroit et est énoncé comme tel, la
disparition d'une vérification censée être indépendante côté serveur. Défense en
profondeur, non contrôle primaire.
*Démonstration* : pseudo-code, une requête d'authentification portant un
`X-Forwarded-Host` arbitraire, acceptée par le serveur. Exécutable sauté, pas
d'appareil instrumenté. Négative, et c'est elle qui borne la revendication :
l'authentificateur refuse de produire une assertion pour un domaine où la
passkey n'a pas été créée, donc la prise de compte n'aboutit pas.
*Revue adverse* : question 6 productive, il existe une protection en amont, la
liaison au domaine côté authentificateur. Question 10 productive, la distinction
sécurité contre robustesse tranche pour la sécurité mais en défense en
profondeur. Question 11 productive, contrôle secondaire. Question 13 : un
inconnu n'obtient pas de compte, seulement l'affaiblissement d'un garde. Les
autres sans objet.
*Portes* : Processus OK. Atteignabilité OK. Impact réel OK en lecture
restreinte. Démonstration OK, la négative délimite. Bornes sans objet.
Environnement OK, le défaut de l'image active la condition.
**Verdict : vrai positif, moyen, impact restreint à la perte d'un contrôle
indépendant.**

**F-12 — aucune protection contre l'encadrement.**
`server/index.js`, absence d'en-tête.
*Flux* : source, un site tiers ; puits, une action administrateur à un clic,
l'acceptation d'appairage de F-02.
*Exploitabilité* : contrôle attaquant sur la page englobante uniquement, et sur
le moment du clic. Bornes sans objet. Concurrence sans objet.
*Impact* : la revendication initiale, large, portait sur l'absence générale
d'en-têtes de sécurité ; elle est tombée en deux morceaux. Le volet politique de
sécurité du contenu contre l'injection de script est annulé par l'assainissement
systématique, déjà établi dans ce registre ; le volet `nosniff` est annulé par
des types de contenu corrects sur toutes les réponses. Seul l'encadrement
subsiste.
*Démonstration* : pseudo-code, une page tierce chargeant l'interface dans un
cadre transparent superposé à un leurre. Exécutable sauté, pas de navigateur
piloté. Négative : les deux autres volets ne produisent aucun effet, ce qui est
ce qui a réduit la revendication.
*Revue adverse* : question 1 productive, la reformulation a scindé la
revendication en trois dont deux sont tombées. Question 12 productive, la
démonstration ne prouve que le volet restant. Les autres sans objet.
*Portes* : Processus OK. Atteignabilité OK. Impact réel OK mais faible, il faut
un administrateur connecté et un clic dirigé. Démonstration OK. Bornes sans
objet. Environnement OK.
**Verdict : vrai positif étroit, faible.**

**F-13 — fuite d'adresse IP par l'attribut de style.**
`src/utils/richText.js:103`.
*Flux* : source, le contenu de note d'un pair appairé ; puits, le rendu HTML
dans le navigateur du lecteur. Frontière : pair vers utilisateur local.
Protection d'environnement absente, aucune politique de sécurité du contenu
côté serveur ni dans `index.html`.
*Exploitabilité* : contrôle total sur le contenu de note pour un pair appairé.
Bornes sans objet. Concurrence sans objet.
*Impact* : sécurité réelle mais bornée, seuls l'adresse IP du lecteur et
l'instant de lecture fuient.
*Démonstration* : pseudo-code, une note portant une règle de style référençant
une ressource externe. Exécutable sauté, pas de navigateur piloté. Négative : le
contenu de la note n'est pas exfiltrable par ce canal, ce qui délimite l'impact.
*Revue adverse* : question 4 productive et déterminante, l'assainissement du
Markdown exclut délibérément les images pour cette raison précise, ce qui montre
l'intention et son non-application à l'éditeur riche. Question 12 productive, la
démonstration ne prouve que la fuite d'adresse. Les autres sans objet.
*Portes* : Processus OK. Atteignabilité OK. Impact réel OK mais borné.
Démonstration OK. Bornes sans objet. Environnement OK, aucune politique de
contenu ne s'y oppose.
**Verdict : vrai positif, faible.**

**F-14 — vue web Android permissive.**
`WebViewActivity.kt:511-524`.
*Flux* : source cherchée, le contenu de note ; puits, le pont natif
`AndroidReminders` et l'accès aux fichiers locaux. Aucun chemin reliant les deux
n'a été trouvé.
*Exploitabilité* : contrôle attaquant non établi. La revue adverse a cherché un
chemin depuis le contenu de note vers le pont et n'en a trouvé aucun,
l'assainissement tenant.
*Impact* : réduction de marge, non faille active. Défense en profondeur.
*Démonstration* : aucune positive n'a pu être construite, ce qui est le résultat
et non une lacune. Exécutable sauté, pas d'appareil instrumenté.
*Revue adverse* : question 2 productive, il existe bien une validation amont,
l'assainissement. Question 7 déterminante, le contrôle attaquant n'est pas
établi. Question 13 : rien à gagner en l'état. Les autres sans objet.
*Portes* : Processus OK. Atteignabilité ÉCHEC en tant que faille, aucun chemin
d'entrée. Impact réel OK en durcissement seulement. Démonstration ÉCHEC, aucune
positive. Bornes sans objet. Environnement OK.
**Verdict : pas de faille exploitable démontrée ; retenu comme durcissement,
faible. Les deux portes en échec sont la raison pour laquelle l'entrée n'est pas
présentée comme une vulnérabilité.**

**F-15 — APK de debug signé avec la clé de production.**
`android/app/build.gradle.kts:59-62`.
*Flux* : source, la configuration de signature ; puits, l'identité de signature
portée par l'APK de debug.
*Exploitabilité* : aucun contrôle attaquant à distance. Il faut obtenir le
fichier.
*Impact* : sécurité réelle si le fichier circule, nulle sinon.
*Démonstration* : pseudo-code, un APK debug inspectable présenté au système avec
l'empreinte officielle. Exécutable sauté. Négative : cette entrée est l'inverse
d'une revendication réfutée, la crainte initiale d'un repli silencieux vers la
clé de debug pour les compilations de publication, écartée puisque sans fichier
de clés le type release ne reçoit aucune configuration de signature et produit
un APK non signé.
*Revue adverse* : question 1 productive, la reformulation a inversé le sens du
défaut. Question 6 productive, la protection est organisationnelle et non
technique. Les autres sans objet.
*Portes* : Processus OK. Atteignabilité OK sous condition de diffusion, nommée.
Impact réel OK. Démonstration OK. Bornes sans objet. Environnement OK.
**Verdict : vrai positif, faible, conditionné à la diffusion du fichier.**

**F-16 — message d'erreur interne renvoyé.**
`server/index.js:4039`.
*Flux* : source, l'exception levée pendant l'import ; puits, le corps de la
réponse HTTP.
*Exploitabilité* : contrôle attaquant partiel, un compte quelconque déclenchant
un import en échec choisit en partie l'erreur obtenue. Bornes sans objet.
Concurrence sans objet.
*Impact* : divulgation d'information réelle mais modeste, phase de
reconnaissance. Aucune décision de sécurité franchie.
*Démonstration* : pseudo-code, un import malformé renvoyant un message portant
des détails de schéma. Exécutable sauté, pas de harnais.
*Revue adverse* : question 10 productive, la distinction tranche pour la
sécurité mais avec un gain faible. Question 13 : peu à gagner. Les autres sans
objet.
*Portes* : Processus OK. Atteignabilité OK. Impact réel OK mais faible.
Démonstration OK. Bornes sans objet. Environnement OK.
**Verdict : vrai positif, faible.**

**F-17 — pseudo-compte fédéré ajoutable comme collaborateur local.**
`server/index.js:2681`, à comparer aux variantes filtrées en `:1114-1117`.
*Flux* : source, le champ `username` du partage local ; puits,
`addCollaborator`. Référence croisée déterminante : les chemins de fédération
utilisent partout `getRealUserByEmail` et `getRealUserByName`, ce chemin non.
*Exploitabilité* : contrôle attaquant, un compte quelconque. Bornes sans objet.
Concurrence sans objet.
*Impact* : la sous-revendication grave, la connexion sous un pseudo-compte, a
été réfutée : `server/index.js:1972` et `:2117` refusent toute ligne portant
`federated_origin`, et ces comptes n'ont ni `secret_key_hash` ni
`show_on_login`. Ce qui reste est une incohérence de chemin et une confirmation
d'existence d'une personne sur le serveur distant.
*Démonstration* : pseudo-code, un partage visant l'adresse synthétique d'un
pseudo-compte. Exécutable sauté, pas de harnais. Négative, et c'est elle qui a
fait tomber le volet grave : une tentative de connexion sur ce même compte est
refusée.
*Revue adverse* : question 1 productive, la reformulation a séparé la prise de
compte, réfutée, de l'incohérence de chemin, retenue. Question 4 productive, les
variantes filtrées existent et ne sont pas utilisées ici. Question 13 : gain
faible. Les autres sans objet.
*Portes* : Processus OK. Atteignabilité OK. Impact réel OK mais faible.
Démonstration OK, la négative a réduit la revendication. Bornes sans objet.
Environnement OK.
**Verdict : vrai positif, faible.**

### F-18 à F-21, entrées de durcissement

Ces quatre entrées ne formulent pas de revendication d'exploitabilité. Le
registre ne leur en invente pas une, et ne leur attribue donc pas un verdict
vrai ou faux positif, qui n'aurait pas d'objet. Chacune reçoit néanmoins sa
grille de portes, parce que c'est précisément une porte en échec qui explique
pourquoi elle reste informationnelle, et la revue adverse question par question,
au même format compact que les entrées précédentes. La disposition la plus
fréquente y est « sans objet », et c'est le résultat attendu : une revendication
qui ne franchit pas la porte d'atteignabilité n'a pas de flux à contester.

**F-18 — longueur de sceau non fixée sur les neuf appels de déchiffrement
authentifié.** `server/encryption/*.js`, plus
`server/routes/passkeyRoutes.js:802`. Node accepte un sceau GCM tronqué quand
`authTagLength` n'est pas posé, ce qui abaisse le coût d'une contrefaçon.
*Revue adverse* : 1, la revendication tient une fois reformulée, mais reformulée
elle devient « qui écrit déjà dans la base peut forger un sceau », ce qui la
vide. 2, sans objet, aucune validation en amont n'est en cause. 3, l'appelant
est le code de lecture du coffre, il ne contraint rien. 4, productive, aucun des
neuf appels ne pose la longueur, donc le motif n'est sûr nulle part dans le
dépôt et l'incohérence ne peut pas servir d'indice. 5, productive, Node accepte
bien les sceaux courts en l'absence du paramètre, le langage n'absorbe donc pas
le problème. 6, productive et déterminante, l'accès au support de stockage est
la protection qui supprime l'effet. 7, l'attaquant contrôle la valeur seulement
s'il écrit déjà dans la base. 8, productive, un sceau de 4 octets donne une
contrefaçon sur 2^32, chiffre recalculé. 9, sans objet, aucune concurrence.
10, sécurité, non robustesse. 11, défense en profondeur. 12, aucune
démonstration positive n'a pu être construite sans accès préalable. 13,
déterminante, l'attaquant n'obtient rien qu'il n'ait déjà.
*Portes* : Processus OK. **Atteignabilité ÉCHEC**, le sceau n'est atteignable
que par qui écrit déjà dans la base ou le coffre, donc après compromission.
Impact réel sans objet, la porte précédente ayant échoué. Démonstration sans
objet. Bornes OK, un sceau de 4 octets donne une contrefaçon sur 2^32.
Environnement OK.
**Statut : durcissement, informationnel. Aucune revendication d'exploitabilité
ne survit à la porte d'atteignabilité.**

**F-19 — clé de signature F-Droid pré-autorisée pour les passkeys.**
`server/routes/assetLinksRoutes.js:44-52`.
*Revue adverse* : 1, reformulée, la revendication dit « une seconde autorité de
signature est acceptée », ce qui est la fonctionnalité voulue et non un défaut.
2, sans objet. 3, sans objet, la liste est statique et non issue d'une entrée.
4, productive, le projet énumère explicitement les empreintes autorisées plutôt
que d'accepter n'importe laquelle, donc le motif est appliqué correctement ici.
5, sans objet. 6, productive, la clé F-Droid n'est détenue que par F-Droid.
7, l'attaquant ne contrôle rien, la liste est en dur. 8, sans objet, aucune
borne chiffrée. 9, sans objet. 10, productive et déterminante, il s'agit d'un
choix de distribution, pas d'un affaiblissement subi. 11, la confiance élargie
est primaire mais consentie. 12, aucune démonstration positive n'existe. 13,
non, un attaquant devrait d'abord compromettre F-Droid.
*Portes* : Processus OK. Atteignabilité OK sur le principe. **Impact réel
ÉCHEC**, c'est un choix de distribution assumé qui élargit un ancrage de
confiance sans ouvrir de chemin d'attaque. Démonstration sans objet, aucune
positive n'existe. Bornes sans objet. Environnement OK.
**Statut : durcissement, informationnel.**

**F-20 — `esbuild` 0.27.7 sous l'avis GHSA-g7r4-m6w7-qqqr.**
`package-lock.json`. Plage 0.27.3 à 0.28.1 confirmée auprès d'OSV.
*Revue adverse* : 1, reformulée, la revendication devient « un poste de
développement sous Windows exécutant le serveur de développement expose ses
fichiers », ce qui est nettement plus étroit que « dépendance vulnérable ».
2, sans objet. 3, sans objet. 4, sans objet, la dépendance est transitive et
unique. 5, sans objet. 6, productive et déterminante, le périmètre d'exécution
en production ne contient pas `esbuild`, `vite` étant une dépendance de
compilation. 7, l'attaquant contrôle le chemin demandé, mais seulement s'il
joint le serveur de développement. 8, productive, la plage de versions a été
recalculée auprès d'OSV plutôt que reprise de l'outil, ce qui a confirmé que
0.27.7 est bien concernée contrairement à l'intuition tirée de l'avis le plus
connu sur ce paquet. 9, sans objet. 10, sécurité. 11, primaire sur le poste
concerné. 12, aucune démonstration construite, pas de poste Windows.
13, seulement contre un développeur, pas contre une instance déployée.
*Portes* : Processus OK. **Atteignabilité ÉCHEC**, la faille vise le serveur de
développement sous Windows et `vite` est une dépendance de compilation, donc
hors du périmètre d'exécution en production. Impact réel sans objet.
Démonstration sans objet. Bornes sans objet. **Environnement ÉCHEC**, le poste
de développement concerné doit tourner sous Windows.
**Statut : durcissement, informationnel. À corriger par mise à jour vers 0.28.1
ou au-delà, sans urgence.**

**F-21 — absence d'infrastructure de test.** `package.json`, aucun script de
test, aucun harnais.
*Revue adverse* : les treize questions portent toutes sur une revendication
d'exploitabilité, et il n'y en a pas ici : l'entrée constate une absence de
harnais, pas un chemin d'attaque. Elles sont donc sans objet une à une, pour ce
même motif unique, et non pour treize raisons distinctes. La seule qui produise
quelque chose est la 4, par retournement : le dépôt applique correctement le
motif inverse à plusieurs endroits, l'assainissement du contenu et les contrôles
d'accès aux notes sont solides, et c'est précisément ce travail qu'aucun test ne
protège d'une régression.
*Portes* : Processus OK. **Atteignabilité sans objet**, ce n'est pas une faille
mais un constat de méthode : aucune des défenses existantes, y compris
l'assainissement et les contrôles d'accès aux notes qui se sont révélés solides,
n'est verrouillée contre une régression future. Les autres portes sont sans
objet.
**Statut : constat de méthode, informationnel.**


## Revendications réfutées

Chacune a été ouverte comme faille probable puis écartée.

**Injection de code par une note fédérée.** Les données du pair atteignent bien
les sept points d'affichage en HTML brut, mais l'assainissement à liste blanche
est le dernier maillon dans les deux producteurs, `src/utils/richText.js:124` et
`src/utils/markdown.jsx:70`. La fonction de mise en lien des contacts, appliquée
après, ne construit que des nœuds de texte et des liens `tel:` ou `mailto:`, et
ne peut donc rien réintroduire. Le titre, les cases à cocher, les images et le
profil du pair ne rejoignent aucun point d'affichage non assaini, l'échappement
automatique du moteur de rendu couvrant le reste. Porte d'impact réel : échec.

**Annuaire utilisateurs exposé aux pairs.** Les faits sont exacts, une recherche
vide produit le motif `%%` et renvoie jusqu'à cent comptes réels. Mais
l'endpoint local jumeau en `server/index.js:4579` se comporte identiquement, le
client officiel appelle lui-même avec une recherche vide, et le journal des
modifications annonce que le sélecteur de partage montre les vraies personnes de
l'autre serveur, sur des instances explicitement déclarées de confiance. Aucun
contrôle n'est contourné. Question 13 : l'attaquant est un pair que
l'administrateur a accepté, il n'obtient rien qui ne lui soit destiné.

**Divulgation de version sans authentification.** La même information est
publique par les fichiers statiques et la route de personnalisation. Le canal
fédération n'ajoute aucune surface. Porte d'impact réel : échec.

**Vérification de jeton sans liste d'algorithmes.** Réfutée par un test autonome
de trois assertions : avec un secret symétrique, la bibliothèque en version
9.0.2 restreint déjà la vérification aux algorithmes HMAC, rejette `alg:none` et
rejette la confusion de type de clé. Question 5 : le langage, ici la
bibliothèque, absorbe le problème.

**Permission par destinataire côté autorité.** Le serveur autorité accepte une
modification dès qu'un de ses pseudo-comptes de lien peut écrire, sans
identifier lequel. Quatre démonstrations négatives annulent l'impact : un pair
malveillant déclarant l'utilisateur autorisé obtient le même résultat, donc le
gain incrémental d'un garde par destinataire est nul ; un pair honnête est
bloqué localement ; le cas où tous les destinataires sont en lecture seule
fonctionne comme annoncé ; le chemin de réparation du registre est protégé par
quatre gardes cumulatifs. Question 13 : rien à gagner.

**Conteneur exécuté en root.** Le point d'entrée abaisse les privilèges en
`docker/entrypoint.sh:55` avant de lancer le serveur. Porte d'atteignabilité :
échec.

**Contournement de la signature entre serveurs.** Le corps brut est bien capturé
en `server/index.js:68-72`, et uniquement pour les routes de fédération. La
signature couvre donc les octets réellement reçus.

**Accès à une note d'autrui.** La lecture comme l'écriture passent par une
requête qui contrôle la propriété ou la collaboration, et l'instruction de mise
à jour revérifie la condition dans sa clause de restriction. Le propriétaire
n'est jamais réécrit quand un collaborateur modifie la note.

**Repli sur la clé de debug pour les compilations de publication.** Sans fichier
de clés, le type de compilation release ne reçoit aucune configuration de
signature et produit un APK non signé, pas un APK signé avec une clé connue.
Le résiduel réel est inverse et figure en F-15.

**Contournement du contrôle de transport par l'adresse de bouclage.** Quand la
confiance au proxy est active, le contrôle est déjà satisfait par un autre
chemin ; quand elle ne l'est pas, l'en-tête est ignoré.

**Réflexion d'origine sur le flux d'événements.** L'authentification se fait par
jeton porteur et non par cookie, et aucun en-tête d'autorisation des identifiants
n'accompagne la réflexion. Un site tiers ne peut rien lire sans détenir déjà le
jeton.

**Identifiants de session non cryptographiques.** Le repli concerne des clés de
cache locales au navigateur, qui ne portent aucune décision de sécurité.
