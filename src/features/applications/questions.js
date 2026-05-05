const QUESTION_STYLES = {
  SHORT: "short",
  PARAGRAPH: "paragraph",
};

const applicationSteps = [
  {
    questions: [
      {
        id: "ic_name",
        label: "Nombre IC",
        placeholder: "Escribe tu nombre IC",
        style: QUESTION_STYLES.SHORT,
        minLength: 2,
        maxLength: 100,
      },
      {
        id: "maturity",
        label: "Nivel de madurez (1-10)",
        placeholder: "Ej. 8",
        style: QUESTION_STYLES.SHORT,
        minLength: 1,
        maxLength: 2,
      },
      {
        id: "tactic_level",
        label: "Nivel de tactica (1-10)",
        placeholder: "Ej. 7",
        style: QUESTION_STYLES.SHORT,
        minLength: 1,
        maxLength: 2,
      },
      {
        id: "sanctions",
        label: "Has sido sancionado? (si/no)",
        placeholder: "Escribe si o no",
        style: QUESTION_STYLES.SHORT,
        minLength: 2,
        maxLength: 10,
      },
      {
        id: "rank",
        label: "Que rango eres?",
        placeholder: "Ej. Cabo",
        style: QUESTION_STYLES.SHORT,
        minLength: 2,
        maxLength: 60,
      },
    ],
  },
  {
    questions: [
      {
        id: "subdivision",
        label: "Que subdivision quieres? (Halcon/Geof)",
        placeholder: "Ej. Halcon",
        style: QUESTION_STYLES.SHORT,
        minLength: 4,
        maxLength: 20,
      },
      {
        id: "contribution",
        label: "Que puedes aportar a la subdivision?",
        placeholder: "Explica que puedes aportar",
        style: QUESTION_STYLES.PARAGRAPH,
        minLength: 10,
        maxLength: 500,
      },
      {
        id: "tactical_experience",
        label: "Sabes jugar con tactica?",
        placeholder: "Explica brevemente tu experiencia",
        style: QUESTION_STYLES.PARAGRAPH,
        minLength: 5,
        maxLength: 500,
      },
      {
        id: "motivation",
        label: "Por que quieres entrar a la subdivision?",
        placeholder: "Explica por que quieres entrar",
        style: QUESTION_STYLES.PARAGRAPH,
        minLength: 10,
        maxLength: 500,
      },
      {
        id: "weekly_hours",
        label: "Horas semanales que le dedicarias",
        placeholder: "Ej. 15 horas",
        style: QUESTION_STYLES.SHORT,
        minLength: 1,
        maxLength: 50,
      },
    ],
  },
  {
    questions: [
      {
        id: "time_in_kilombo",
        label: "Cuanto tiempo tienes en Kilombo?",
        placeholder: "Ej. 6 meses",
        style: QUESTION_STYLES.SHORT,
        minLength: 2,
        maxLength: 60,
      },
    ],
  },
];

const allQuestions = applicationSteps.flatMap((step) => step.questions);

module.exports = {
  QUESTION_STYLES,
  applicationSteps,
  allQuestions,
};
