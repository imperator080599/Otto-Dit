# Founder ideas document (verbatim, hypothesis inventory — NOT a specification)

> Source: "Idée projet OTTO DIT", provided 2026-08-25. Assessed idea-by-idea in docs/01_IDEA_ASSESSMENT.md.

---

Idées :


La plateforme doit allier 2 faces: 1) interface documentation d'audit et 2) interface requêtes clients. Les deux doivent communiquer entre elles.

Je veux en termes de fonctionnalités:

- Upload de la TB à l'année auditée

- Upload du Grand livre (transactions de l'année auditée)

- Fonction réconciliation grand livre /TB

- à partir de la documentation et méthodologie d'audit officielles disponibles sur internet

- Des agents IA intégrés ou BOT à chaque section d'audit qui récupèrent sur 2) l'interface requêtes clients les populations de sélections (exemple détail de compte), font la réconciliation de ce compte à notre solde en TB, relancent le client en cas d'écarts (requête d'explication), font les sélections selon des paramètres prédéfinis (niveau de risque déterminé dans le GRA = Guided risk assessment, formulaire à remplir pour déterminer le niveau de risque d'un Financial statement line, et les procédures d'audits à mettre en œuvre; et le seuil d'audit)  des préparent la documentation (remplissent le Template intégré), remplisse les templates intégrés avec les informations obtenues du client (sur 2) l'interface requêtes clients), relancent le client sur sur 2) l'interface requêtes clients si des écarts et informations anormales sont repérées lors de la documentation. Donc besoin d'OCR pour lire les documents reçus. 

- Un workflow qui envoit des mails de réunion aux key contact client par exemple pour un entretien de fraude ou une revue analytique

- Un chat bot général qui répond aux questions de l'associé s'il a besoin d'une réponse sans avoir à aller dans les sections d'audit 

- Un dashboard de suivi d'avancé des sections d'audit avec notamment le % documents reçus par sections, ce dashboard doit pouvoir être accessible directement par le client via une vue limitée (le client ne peut pas voir la documentation d'audit) et peut être exprtée en excel et envoyée directement par mail aux key contacts.

- Une analyse macroéconomique, des facteurs externes impactant la ou les entités auditées automatisée

- Une fonction d'intégration de vidéo de réunion sur le controle interne (revue de process et contrôles), avec un agent IA qui documente sa compréhension et éventuellement si besoin d'éclaircissement envoie questions au client, documente aussi les étapes du contrôles et les actions faites / réalisées par le control owner; enfin pour l'operating effectiveness du contrôle demande au client la liste des instances du contrôle sur l'année auditée, fait une sélection, obtient les justifcatifs et documente automatiquement

- Un journal entry testing sem-automatisé, un agent IA pré-rempli des tests qui vont faire ressortir des écritures dont il faudra demander les justificatifs au client, un être humain auditeur doit venir valider les paramètres puis l'agent IA sélectionne automatiquement sur le GL les écritures.

- Sur les templates intégrés, il faut qu'il y ait la possibilité de joindre des fichiers excel au cas où, et un flag d'écart totaux repérés à expliquer; aussi il faut que les auditeurs humains soient capables d'éditer / modifier le template intégéré (rajout colonnes, cellules ect. dans le cas où le testing sortirait du cadre normalisé) dans ce cas le template intégré portera un signe visible indiquant qu'il a été modifié, et la modification devra être justifiée.

- Sur les templates intégrés, il faut dans la section de testing, une claire vision de quel type de document a été obtenu et comment il a été utilisé, par exemple dans un testing du chiffre d'affaires, le bon de livraison et la quantité indiquée.

- la plateforme doit être la plus ergonomique possible et lisible

- Design épuré

- Possibilité de laisser des review notes (commentaires des auditeurs humains seulement)

- Faire en sorte que les agents IA intégrés retiennent les audits passés (seulement une seul et même client) et s'améliorent en continu

- Fonction agent IA qui va regarder si parmi les key contacts du management (organigramme partagé par le client) certains ont des relations avec des clients ou fournisseurs du client (risque de fraude) par exemple un comptable de l'entreprise A dont le cousin est aussi fournisseur de l'entreprise A.

- Une fonction pointage des états financiers et données chiffrées des annexes où après réception de la plaquette du client, un agent IA vient s'assurer que chaque chiffre cadre bien avec les montants que nous avons audité, dans notre TB et documente un réconciliation sur un Template intégré avec à gauche montant plaquette et à droite montant interne et validé avec une cross reference vers l'origine du montant validé. Donc besoin d'OCR pour lire les documents reçus.

- Un moyen simple d'accéder à la synthèse des déficiences de contrôle interne et des "misstatements" écarts observés lors du testing

- Le benchmark et % doivent être proposés par un agent IA et expliqué pourquoi mais validé par un auditeur humain puis le calcul de la matérialité se fera automatiquement

- Un scoping automatique des FSLIs selon la matérialité (montant déterminer par un % d'un benchmark, exemple le revenue, les COGS, l'equity etc.); possibilité de scoper qualitativement un FSLI inférieur à la matérialité

- Dans chaque section un Dashboard synthétique créé automatique avec les comptes composant la section/FSLI et ceux en dessous du CTT (un certain pourcentage de la matérialité) qu'il faudra ignorer et indiquer Not significant ou NS. Possibilité de modifier ce statut si compte particulier

- Revue analytique générée automatiquement, variation comptes entre l'année N (auditée) et N-1 et FSLI, en haut de cette revue analytique un threshold monétaire et un % de variation, si la variation du compte dépasse l'un ou l'autre ou les 2 (à faire valider par un auditeur humain) des questions sur l'explication de la variation sont automatiquement envoyée au client sur l'interface des requêtes.

- Comme il y a des confirmations bancaires à faire (pour confirmer le solde des différents comptes) il faut un agent IA qui demande automatiquement la liste des banques à circulariser avec les contacts mails, une fois la liste obtenue un agent IA regarde la comptabilité et vérifie qu'il ne manque pas de banque si oui il envoi une requête pour demander au client à quoi corresponde les comptes (présents en comptabilité mais absent du listing des banques du client), enfin une demande de confirmation à date  de clôture (telle que définie) est ensuite envoyée pour chaque banque au mail contact donné par le client; avec en copie l'équipe des auditeurs, le contact client qui a fourni les informations relatifs au banque. Une fois la confirmation reçue (possible d'avoir une boite email intégrée avec une adresse email spécifique qui permet aux agents IA de recevoir les documents du clients envoyés via Outlook, de les upload sur la plateforme de documentation d'audit et de faire l'analyse), un agent IA compare le solde confirmé avec celui en compta, si il y a des écarts (quelque soit le montant) une requête de demande d'explication est automatiquement envoyée au client.

- à noter que certaines banques n'acceptent que les confirmations bancaires via confirmation.com que faire dans ce cas de figure?

- Il y aussi des confirmations avocats à faire et envoyer pour confirmer les litiges en cours du client il faut un agent IA qui demande automatiquement la liste des avocats et cabinets juridiques à circulariser avec les contacts mails, une fois la liste obtenue un agent IA regarde la comptabilité (grand livre) et vérifie qu'il ne manque pas de cabinets / avocats si oui il envoit une requête pour demander au client à quoi corresponde les comptes et/ou dépenses (présents en comptabilité mais absent du listing des avocats du client), enfin une demande de confirmation à date de clôture (telle que définie) est ensuite envoyée pour chaque cabient au mail contact donné par le client; avec en copie l'équipe des auditeurs, le contact client qui a fourni les informations relatifs au cabinet/avocat. Une fois la confirmation reçue (possible d'avoir une boite email intégrée avec une adresse email spécifique qui permet aux agents IA de recevoir les documents du clients envoyés via Outlook, de les upload sur la plateforme de documentation d'audit et de faire l'analyse), un agent IA compare analyse la confirmation, liste sur la plateforme de documentation les litiges en cours et les montants provisionnés, un agent IA compare les montants provisionnés avec la comptabilité, si il y a des écarts (au-dessus du CTT) une requête de demande d'explication est automatiquement envoyée au client.


- Que faire dans le cas de provisions du type estimation comptable hors litige? Il y a souvent dans ce cas des fichiers de calculs excel avec des bases de données utilisées. Il faut que l'agent IA en charge de cette section soit capable de 1) rapprocher la base à la comptabilité et 2) tester la base pour s'assurer qu'elle soit bonne = lancement de sampling pour un testing avec obtenion de documents. Si des pourcentages, ratios, ou autre formules etc. sont utilisés dans l'estimation, une demande de justificatif sera aussi ici nécessaire.


- Un problème que j'ai noté dans mon expérience d'auditeur c'est le besoin de faire des excel de tracker de progression de la mission utilisés en internes mais aussi lorsque l'on est component auditor et que l'on doit faire un rapport au groupe ou encore au client. J'ai envie de faire en sorte que l'on puisse directement à partir de la plateforme d'audit générer un excel ou autre fichier de suivi. Le fichier doit être modulable (par exemple on ne va pas montrer la même chose au client et à l'équipe d'audit). Ce fichier trackera la progression de la documentation reçue et documentée par l'équipe d'audit. Ceci permettra à l'équipe de se concentrer sur la seule documentation (à revoir) et ne pas avoir à perdre du temps à faire un excel à part, la plateforme suivra en temps réel la progression. Il faut donc intégrer dans les sections de documentation des claires sections pour chaque documents et un statut : "Not received", "In progress" (lorsque c'est documenté par l'agent IA et intégré mais pas encore revue par les auditeurs humains) on pourrait avoir un statut équivalent spécial pour les équipes d'audit en interne "Awaiting Review from XXX" et mettre en XXX l'auditeur humain en charge de revoir la section. Aussi sur le fichier de suivi il faut qu'il y ait bien préciser : le numéro de la requête faite pour demander les documents comme ça le client saura s'il manque des documents où les uploader, il faut donc selon moi que sur la plateforme d"audit dans chaque section de documentation nous puissions lier et accéder aux requêtes associées à la section.

- Nous avons souvent des revues de process (exemple order to cash, tresorerie, fixed assets etc.) lors desquelles nous faisons des entretiens avec le client. J'aimerais pour ces sections intégrer le transcript de la réunion client avec idéalement la vidéo s'il partage des éléments sur son PC. Et qu'un agent IA compare ce qui a été dit lors de la réunion, et le process flowchart préalablement fourni, cela permettra aux auditeurs de voir les incohérences entre les dire du client et le flowchart. 


- Un problème que j'ai identifié c'est le statut des requêtes de documents. Selon moi le client devrait appuyer sur un bouton intitulé par exemple "All supporting evidence submitted"; sinon la demande restera en partially submitted cela évitera à l'Agent IA de perdre du temps et de se concentrer que sur les demandes  remplies ou partiellement remplies; l'agent IA devra aussi relancer le client pour les demandes non-remplies et partiellement remplies (délai de relance à définir).

- J'ai envie à termes de faire en sorte que l'on puisse "éliminer" le besoin des requêtes clients et directement via API ou autre avoir accès à l'ERP du client et récupérer les documents nécessaires. Peut être faudra-t-il instaurer un système de validation côté client où il devra approuver l'inspection de la documentation d'une certaine transaction.

