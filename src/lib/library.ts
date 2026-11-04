import { INTRO, OUTRO } from "@/lib/sections";
import { MERGE } from "@/lib/flow";
import { LEVELS } from "@/lib/levels";

/**
 * Built-in checklists anyone can add to their organization. Items follow the
 * template_items columns; positions are the index in `items`. `jump_to` maps
 * an answer to a later position (MERGE to where the branches meet).
 */
export type LibraryItem = {
  section: string;
  type: "checkbox" | "text" | "number" | "dropdown";
  label: string;
  help_text?: string;
  required?: boolean;
  allow_note?: boolean;
  options?: string[];
  /** Position of the parent question and the answer that shows this one. */
  parent?: { position: number; value: string };
  jump_to?: Record<string, number>;
};

export type LibraryTemplate = {
  key: string;
  title: string;
  description: string;
  category: string;
  items: LibraryItem[];
};

const LIGHT = "Lightbokning";
const SERVICE = "Service";
const REPAIR = "Reparation";
const SUMMARY = "Sammanfatta";
const PRICE = "Pris och invändningar";

// Positions of the first question in each branch, and where they meet.
const LIGHT_START = 5;
const SERVICE_START = 10;
const REPAIR_START = 17;
const MERGE_AT = 27;
const OBJECTION = 32;

const bookingCall: LibraryTemplate = {
  key: "bokningssamtal",
  title: "Inkommande bokningssamtal",
  description:
    "Samtalsbana från öppning till bokad tid. Välj typ av bokning så visas rätt frågor: Lightbokning (utan reservdelar), Service eller Reparation.",
  category: "Centralbokning",
  items: [
    // INTRO — the first 20 seconds. Positions 0–4.
    {
      section: INTRO,
      type: "text",
      label: "Registreringsnummer",
      required: true,
      help_text:
        '"Det hjälper jag dig med. Får jag ta ditt registreringsnummer först, så har jag bilen framför mig medan vi pratar?" Lyssna färdigt på kundens första mening innan du frågar.',
    },
    {
      section: INTRO,
      type: "text",
      label: "Kundens namn",
      required: true,
      help_text:
        '"Och vem pratar jag med?" Använd förnamnet 2–3 gånger under samtalet, inte oftare.',
    },
    {
      section: INTRO,
      type: "checkbox",
      label: "Bilen bekräftad",
      help_text:
        'Slå upp bilen och säg högt: "Då har jag en [märke modell årsmodell] här – stämmer det?" Kolla historiken: senaste service, tidigare anmärkningar.',
    },
    {
      section: INTRO,
      type: "text",
      label: "Kundens egna ord om ärendet",
      required: true,
      help_text:
        '"Berätta, vad är det som händer med bilen?" Avbryt inte. Skriv kundens egna ord, inte din tolkning – det går vidare till verkstaden.',
    },
    {
      section: INTRO,
      type: "dropdown",
      label: "Typ av bokning",
      required: true,
      options: [LIGHT, SERVICE, REPAIR],
      help_text:
        "Lightbokning = utan reservdelar (hjulskifte, besiktningskoll, felkodsläsning, AC-koll). Service = underhållsservice enligt intervall. Reparation = något är trasigt och delar kan behöva beställas.",
      jump_to: {
        [LIGHT]: LIGHT_START,
        [SERVICE]: SERVICE_START,
        [REPAIR]: REPAIR_START,
        [MERGE]: MERGE_AT,
      },
    },

    // LIGHTBOKNING — no spare parts. Positions 5–9.
    {
      section: LIGHT,
      type: "dropdown",
      label: "Vad ska göras?",
      required: true,
      allow_note: true,
      options: ["Hjulskifte", "Besiktningskoll", "Felkodsläsning", "AC-koll", "Övrigt"],
      help_text: "Skriv i anteckningen om kunden vill ha något utöver alternativen.",
    },
    {
      section: LIGHT,
      type: "number",
      label: "Mätarställning (mil, ungefär)",
      help_text:
        '"Hur många mil har bilen gått ungefär?" Styr om service är nära och kan läggas till.',
    },
    {
      section: LIGHT,
      type: "checkbox",
      label: "Hur bråttom – frågat",
      help_text: '"När behöver du bilen klar? Har du något inbokat snart som bilen behövs till?"',
    },
    {
      section: LIGHT,
      type: "checkbox",
      label: "Merförsäljning – frågat",
      allow_note: true,
      help_text:
        '"När bilen ändå är inne – är det något mer du funderat på? Torkarblad, batteri, spolarvätska?" Om nära service: "Ska vi slå ihop det med service så slipper du komma tillbaka om en månad?"',
    },
    {
      section: LIGHT,
      type: "checkbox",
      label: "Vänta eller hämta – frågat",
      help_text:
        '"Vill du vänta på plats, det tar ungefär [X] minuter, eller lämna bilen och hämta senare?"',
    },

    // SERVICE — maintenance. Positions 10–16.
    {
      section: SERVICE,
      type: "number",
      label: "Mätarställning (mil)",
      required: true,
      help_text: '"Hur många mil har bilen gått?" Avgör vilken service som är dags.',
    },
    {
      section: SERVICE,
      type: "text",
      label: "Senaste service",
      help_text:
        '"När gjordes service senast, vet du det?" Kolla historiken om bilen varit hos oss.',
    },
    {
      section: SERVICE,
      type: "dropdown",
      label: "Servicetyp",
      required: true,
      options: ["Liten service", "Stor service", "Enligt intervall / vet ej"],
      help_text: "Osäker? Boka enligt intervall och låt verkstaden avgöra, säg det till kunden.",
    },
    {
      section: SERVICE,
      type: "checkbox",
      label: "Något kunden vill att vi tittar på – frågat",
      allow_note: true,
      help_text:
        '"Finns det något du märkt – ljud, lampor, bromsar – som vi ska kolla samtidigt?" Skriv svaret i anteckningen.',
    },
    {
      section: SERVICE,
      type: "checkbox",
      label: "Besiktning – frågat",
      help_text: '"När är det besiktning? Vill du att vi gör en koll inför den samtidigt?"',
    },
    {
      section: SERVICE,
      type: "checkbox",
      label: "Hjulskifte – frågat (säsong)",
      help_text:
        'Okt–nov och mars–april: "Är det dags för hjulskifte? Då bokar vi det i samma tid."',
    },
    {
      section: SERVICE,
      type: "checkbox",
      label: "Hemfärd / lånebil – frågat",
      help_text:
        '"Hur tar du dig hem om bilen står hos oss över dagen – behöver du lånebil?" Tar bort ett vanligt hinder för bokning.',
    },

    // REPARATION — something is broken. Positions 17–26.
    {
      section: REPAIR,
      type: "checkbox",
      label: "När märks felet – frågat",
      allow_note: true,
      help_text:
        '"När märker du det – kallstart, vid fart, vid bromsning, i svängar?" Skriv svaret i anteckningen.',
    },
    {
      section: REPAIR,
      type: "checkbox",
      label: "Hur länge, blir det värre – frågat",
      allow_note: true,
      help_text: '"Hur länge har det hållit på? Blir det värre?" Avgör hur bråttom det är.',
    },
    {
      section: REPAIR,
      type: "dropdown",
      label: "Varningslampa",
      required: true,
      options: ["Ingen", "Gul", "Röd"],
      help_text:
        '"Lyser någon lampa i instrumentpanelen? Vilken färg?" Röd = boka snarast. Gul = kan vänta kort.',
    },
    {
      section: REPAIR,
      type: "checkbox",
      label: "Ljud, lukt, känsla – frågat",
      allow_note: true,
      help_text:
        '"Låter det, luktar det eller känns det i ratten eller pedalen?" Ger verkstaden konkreta symtom.',
    },
    {
      section: REPAIR,
      type: "number",
      label: "Mätarställning (mil)",
      help_text: '"Hur många mil har bilen gått ungefär?"',
    },
    {
      section: REPAIR,
      type: "checkbox",
      label: "Tittat av någon annan – frågat",
      help_text:
        '"Har någon annan tittat på det redan?" Undviker dubbelarbete och visar om kunden jämför.',
    },
    {
      section: REPAIR,
      type: "checkbox",
      label: "Hur bråttom – frågat",
      help_text:
        '"Hur använder du bilen – pendlar du dagligen, eller står den mest?" "Har du någon resa eller något inbokat snart?" Skapar brådska utan att du pressar.',
    },
    {
      section: REPAIR,
      type: "checkbox",
      label: "Felsökning förklarad",
      required: true,
      help_text:
        '"Felsökningen kostar [X] kr. Sen ringer teknikern dig innan något byts, så du bestämmer själv innan det kostar mer." Tar bort rädslan för en överraskningsfaktura.',
    },
    {
      section: REPAIR,
      type: "checkbox",
      label: "Service samtidigt – frågat",
      help_text:
        'Om nära service enligt mil/datum: "Ska vi slå ihop det så slipper du komma tillbaka om en månad?"',
    },
    {
      section: REPAIR,
      type: "checkbox",
      label: "Hemfärd / lånebil – frågat",
      help_text:
        '"Behöver du bilen samma dag, eller kan den stå över natten? Hur tar du dig hem – behöver du lånebil?"',
    },

    // SAMMANFATTA — branches meet here. Positions 27–28.
    {
      section: SUMMARY,
      type: "dropdown",
      label: "Viktigast för kunden",
      required: true,
      options: ["Snabbt", "Billigt", "Trygghet"],
      help_text:
        '"Vad är viktigast för dig – att det blir klart snabbt, så billigt som möjligt, eller att du vet exakt vad som gjorts?" Svaret avgör hur du presenterar priset.',
    },
    {
      section: SUMMARY,
      type: "checkbox",
      label: "Sammanfattat och fått ett ja",
      required: true,
      help_text:
        '"Okej [namn], om jag förstått dig rätt: [vad] sedan [tid], bilen behövs [när], och du vill gärna [snabbt/billigt/veta exakt]. Stämmer det?" Rättar kunden dig – bra, sammanfatta igen kort.',
    },

    // PRIS — solution, price, silence, objections. Positions 29–37.
    {
      section: PRICE,
      type: "checkbox",
      label: "Lösningen presenterad",
      required: true,
      help_text:
        '"Det vi gör då är att [åtgärd]. Teknikern [felsöker/byter/kontrollerar] och du får veta exakt vad som gjorts." Snabbt → närmaste tid, klart samma dag. Billigt → vad som ingår, inget byts utan ok. Trygghet → teknikern ringer, garanti på arbetet.',
    },
    {
      section: PRICE,
      type: "checkbox",
      label: "Priset sagt – sedan tyst",
      required: true,
      help_text:
        '"Det landar på [X] kr inklusive delar, arbete och moms." Inga "bara", "tyvärr" eller "ungefär". Räkna till tre i huvudet. Låt kunden svara först.',
    },
    {
      section: PRICE,
      type: "checkbox",
      label: "Två alternativ erbjudna (vid behov)",
      help_text:
        '"Vi kan göra bara [felet] för [X] kr, eller ta service samtidigt så blir totalen [Y] kr och du slipper komma tillbaka. Vilket passar dig bäst?" Kunden väljer mellan två ja.',
    },
    {
      section: PRICE,
      type: "dropdown",
      label: "Invändning",
      options: [
        "Ingen",
        "Det var dyrt",
        "Ska jämföra / återkommer",
        "Inte så bråttom",
        "Vill ha gratis koll",
        "Tiden passar inte",
      ],
      help_text:
        'Bekräfta först ("Jag förstår"), svara kort, avsluta med en fråga som leder tillbaka till bokningen. Argumentera aldrig emot.',
    },
    {
      section: PRICE,
      type: "checkbox",
      label: "Svar: det var dyrt",
      parent: { position: OBJECTION, value: "Det var dyrt" },
      help_text:
        '"Jag förstår. I priset ingår delar, arbete och garanti. Vad hade du räknat med?" Lyssna. Sen: "Vill du att vi gör bara det nödvändiga nu, så tar vi resten senare?"',
    },
    {
      section: PRICE,
      type: "checkbox",
      label: "Svar: ska jämföra / återkommer",
      parent: { position: OBJECTION, value: "Ska jämföra / återkommer" },
      help_text:
        '"Självklart. Ska jag hålla tiden på [dag] till i morgon, så förlorar du inte platsen? Du kan avboka utan kostnad." Eller: "Vad är det du vill fundera på – priset eller tiden?"',
    },
    {
      section: PRICE,
      type: "checkbox",
      label: "Svar: inte så bråttom",
      parent: { position: OBJECTION, value: "Inte så bråttom" },
      help_text:
        '"Med [symtom] brukar det bli dyrare ju längre det går, så jag skulle inte vänta för länge. Ska vi ta en tid om två veckor i stället?"',
    },
    {
      section: PRICE,
      type: "checkbox",
      label: "Svar: vill ha gratis koll",
      parent: { position: OBJECTION, value: "Vill ha gratis koll" },
      help_text:
        '"Vi behöver en tekniker och lyft för att se något, därför tar vi [X] kr för felsökningen. Men du betalar inget mer utan att vi ringt dig först."',
    },
    {
      section: PRICE,
      type: "checkbox",
      label: "Svar: tiden passar inte",
      parent: { position: OBJECTION, value: "Tiden passar inte" },
      help_text:
        '"Inga problem. Vilka dagar är du ledig – förmiddag eller eftermiddag?" Ge sedan två nya alternativ.',
    },

    // AVSLUT — booking and handover. Positions 38–43.
    {
      section: OUTRO,
      type: "checkbox",
      label: "Två tider erbjudna",
      required: true,
      help_text:
        '"Jag har en tid på torsdag 8.00 och en på fredag 13.00 – vilken passar dig bäst?" Fråga aldrig "vill du boka?" – det ger ett ja/nej.',
    },
    {
      section: OUTRO,
      type: "text",
      label: "Bokad tid",
      help_text:
        'Lägg in bokningen medan kunden är kvar i luren. Säg vad du gör: "Då lägger jag in dig på torsdag 8.00."',
    },
    {
      section: OUTRO,
      type: "checkbox",
      label: "Allt bekräftat högt",
      required: true,
      help_text:
        'I denna ordning: dag, tid och när bilen lämnas · allt som ska göras (även merförsäljningen) · pris eller prisram · lånebil/hemfärd · telefonnummer teknikern ringer på. "Du får en bekräftelse på sms/mejl."',
    },
    {
      section: OUTRO,
      type: "checkbox",
      label: "Sista frågan ställd",
      help_text:
        '"Är det något mer du vill att teknikern ska titta på när bilen ändå är inne?" Kunden kommer ofta på något just då.',
    },
    {
      section: OUTRO,
      type: "checkbox",
      label: "Överlämning till verkstaden skriven",
      required: true,
      help_text:
        'Skriv i bokningen direkt: kundens egna ord · när det märks och hur länge · lampor · mil och senaste service · allt som ska göras · pris sagt till kunden · "ring innan byte" vid felsökning · lånebil/klart när · telefonnummer och bästa tid att ringa. Lovat något verkstaden måste bekräfta? Säg det till dem direkt.',
    },
    {
      section: OUTRO,
      type: "dropdown",
      label: "Resultat",
      required: true,
      options: ["Bokad", "Återkoppling bokad", "Ej bokad"],
      help_text:
        'Ej bokad? Be om lov att ringa tillbaka: "Får jag ringa dig på [dag] och höra hur du tänkt?" Skriv upp det och ring.',
    },
  ],
};

export const LIBRARY: LibraryTemplate[] = [bookingCall];

/** Rows for template_items (without version_id and org_id) for a library checklist. */
export function libraryRows(tpl: LibraryTemplate) {
  return tpl.items.map((i, position) => ({
    position,
    section: i.section,
    type: i.type,
    label: i.label,
    help_text: i.help_text ?? null,
    required: i.required ?? false,
    allow_note: i.allow_note ?? false,
    allow_photo: false,
    options: i.options ?? [],
    parent_position: i.parent?.position ?? null,
    show_when: i.parent?.value ?? null,
    jump_to: i.jump_to ?? {},
    levels: [...LEVELS],
  }));
}
