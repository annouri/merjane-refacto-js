# Décisions de refactoring

## Démarche

1. **Safety net d'abord** : le test d'intégration fourni ne vérifiait que l'existence
   de la commande. J'ai ajouté 10 characterization tests passant par l'endpoint,
   qui vérifient le stock en base et les notifications (avec leurs arguments)
   pour tous les cas métier des produits NORMAL, SEASONAL et EXPIRABLE.
   Les valeurs attendues reflètent le comportement ACTUEL, bugs compris.
2. **Validation des tests** : après avoir refactoré les tests (extraction de helpers),
   j'ai introduit volontairement un bug dans le code pour vérifier qu'ils échouaient.
3. **Refactoring en baby steps** : un commit par étape, tests verts à chaque commit.

## Architecture obtenue

Controller (HTTP) → OrderService (orchestration de la commande)
→ ProductService (règles métier des produits) → ProductRepository (accès aux données)

- **Séparation des couches** : le controller ne contient plus aucune logique métier ;
  les services ne dépendent plus directement de Drizzle.
- **SRP** : orchestrer une commande et appliquer les règles d'un produit sont deux
  responsabilités distinctes, d'où la création d'OrderService.
- **Une méthode par type de produit** dans OrderService : `processOrder` ne fait
  plus que déléguer, chaque méthode porte une seule règle métier.
- **Lisibilité** : noms issus du vocabulaire du cahier des charges.
- Le port de notification (fichier WARN) est conservé tel quel : la couche métier
  dépend de l'interface, pas de l'implémentation.

## Écarts détectés, volontairement NON corrigés

La mission demandait zéro régression. Ces comportements sont figés par les tests
et devraient être validés avec le Product Owner avant toute correction :

- **EXPIRABLE non expiré mais en rupture** : une notification d'_expiration_
  est envoyée, alors que le produit n'est pas expiré.
- **SEASONAL commandé avant sa saison, avec du stock** : une notification de
  rupture est envoyée, et le stock reste inchangé.
- **NORMAL en rupture avec leadTime = 0** : aucune notification n'est envoyée
  (cas non spécifié dans le cahier des charges).
- **Bornes de saison** : la disponibilité utilise des comparaisons strictes
  (`>` et `<`) sur les dates de début et de fin (visible dans
  `processSeasonalProduct`). Le comportement exactement aux bornes reste
  à clarifier avec le métier.

## Choix assumés

- Clés du DI container (`ns`, `ps`, `pr`, `os`) non renommées : les tests
  d'intégration enregistrent le mock sous la clé `ns`.
- Méthode `notifyDelay` conservée : elle est utilisée par le test unitaire existant.
- Pas de pattern plus complexe (Strategy) à ce stade, pour garder des étapes
  sûres dans la timebox.

## Avec plus de temps

- `OrderRepository` : `getOrderWithProducts` est aujourd'hui dans ProductRepository.
- Strategy pattern par type de produit, pour ajouter un nouveau type sans modifier
  le code existant (Open/Closed).
- ProductService mélange encore règles métier, persistance et notifications :
  séparer davantage (SRP).
- Supprimer la branche morte de `handleExpiredProduct` (déjà vérifiée par
  `processExpirableProduct` avant l'appel).
- SEASONAL avant sa saison, avec stock et un leadTime dépassant la fin de saison :
  le stock est mis à 0. Ajouter un test pour figer ce cas, puis valider avec le PO.
- Tests unitaires des services avec un repository mocké, et injection d'une horloge
  pour tester les dates sans dépendre de `Date.now()`.
- Transactions et gestion d'erreur (commande inexistante, non-null assertions).

## Usage de l'IA

Claude Code a été utilisé comme binôme, encadré par des règles explicites :
baby steps, aucune modification des assertions, aucune correction de bug,
aucun commit automatique. Il a servi à analyser le code, proposer les cas de test
et exécuter des refactorings unitaires. Chaque changement a été relu, testé
et commité par moi.
