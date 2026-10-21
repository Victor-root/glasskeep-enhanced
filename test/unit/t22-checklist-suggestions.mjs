// Les suggestions d'une liste à cocher, comme dans Google Keep: taper un
// élément déjà coché propose de le reprendre plutôt que d'en créer un
// doublon, et le reprendre le décoche à la place de la ligne tapée.
//
// Les règles vérifiées ici: ce qui est proposé (début d'un mot, sans
// tenir compte des majuscules ni des accents, un seul exemplaire par
// texte, ceux qui commencent par la saisie d'abord), et ce que devient la
// liste quand on choisit une suggestion.
import { runner } from "../federation/lib.mjs";
import { suggestCheckedItems, restoreCheckedItem } from "../../src/utils/checklist.js";

const t = runner("Les suggestions des listes à cocher");
const el = (id, text, done, indent = 0) => ({ id, text, done, indent });
const textes = (s) => s.map((x) => x.text).join(", ");

const liste = [
  el("salade", "Salade", false),
  el("lait", "Lait", true),
  el("pain", "Pain complet", true),
  el("creme", "Crème fraîche", true),
  el("lait2", "lait", true),
  el("palais", "Palais", true),
  el("tape", "", false),
];

t.check("seuls les éléments cochés sont proposés, ceux qui commencent par la saisie d'abord",
  textes(suggestCheckedItems(liste, "la")) === "Lait", textes(suggestCheckedItems(liste, "la")));
t.check("un mot au milieu du texte compte, pas un morceau de mot",
  textes(suggestCheckedItems(liste, "comp")) === "Pain complet"
    && suggestCheckedItems(liste, "lais").length === 0);
t.check("les majuscules et les accents ne comptent pas",
  textes(suggestCheckedItems(liste, "CREME")) === "Crème fraîche");
const surbrillance = suggestCheckedItems(liste, "fraiche")[0];
t.check("la partie trouvée est repérée dans le texte d'origine, accents compris",
  surbrillance?.text.slice(...surbrillance.match) === "fraîche", JSON.stringify(surbrillance));
t.check("un texte en double n'est proposé qu'une fois",
  suggestCheckedItems(liste, "lait").length === 1);
t.check("une saisie vide ne propose rien", suggestCheckedItems(liste, "   ").length === 0);
const beaucoup = Array.from({ length: 9 }, (_, i) => el(`p${i}`, `Pomme ${i}`, true));
t.check("au plus cinq suggestions", suggestCheckedItems(beaucoup, "pom").length === 5);

const familles = [
  el("tape", "pa", false),
  el("salade", "Salade", false),
  el("pates", "Pâtes", true),
  el("sauce", "Sauce", true, 1),
  el("oeufs", "Œufs", true),
];
const reprise = restoreCheckedItem(familles, "tape", "pates");
t.check("l'élément repris prend la place de la ligne tapée, décoché, sans doublon",
  reprise.map((e) => e.id).join() === "pates,sauce,salade,oeufs"
    && reprise[0].done === false && reprise[0].text === "Pâtes",
  reprise.map((e) => e.id + (e.done ? "✓" : "")).join());
t.check("ses sous-éléments viennent avec lui, décochés eux aussi",
  reprise[1].id === "sauce" && reprise[1].done === false && reprise[1].indent === 1);
const retrait = restoreCheckedItem([el("a", "A", false), el("tape", "b", false, 1), el("b", "B", true)], "tape", "b");
t.check("il prend le retrait de la ligne qu'il remplace",
  retrait[1].id === "b" && retrait[1].indent === 1, JSON.stringify(retrait));
t.check("un élément non coché n'est pas repris",
  restoreCheckedItem(familles, "tape", "salade") === familles);

process.exit(t.summary() ? 0 : 1);
