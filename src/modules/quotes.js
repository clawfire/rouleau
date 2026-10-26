/** Short quotes for the morning ticket (public-domain authors and proverbs), picked by day of year. */
export const QUOTES = [
  { text: "Ce n'est pas parce que les choses sont difficiles que nous n'osons pas, c'est parce que nous n'osons pas qu'elles sont difficiles.", by: 'Sénèque' },
  { text: "Il n'est pas de vent favorable pour celui qui ne sait où il va.", by: 'Sénèque' },
  { text: "Ce qui fait obstacle à l'action fait avancer l'action. Ce qui barre le chemin devient le chemin.", by: 'Marc Aurèle' },
  { text: 'Ce ne sont pas les choses qui troublent les hommes, mais les jugements qu\'ils portent sur les choses.', by: 'Épictète' },
  { text: 'Un voyage de mille lieues commence toujours par un premier pas.', by: 'Lao Tseu' },
  { text: 'Le chemin se fait en marchant.', by: 'Antonio Machado' },
  { text: 'Rien ne sert de courir ; il faut partir à point.', by: 'La Fontaine' },
  { text: 'Patience et longueur de temps font plus que force ni que rage.', by: 'La Fontaine' },
  { text: 'Il faut cultiver notre jardin.', by: 'Voltaire' },
  { text: "On ne voit bien qu'avec le cœur. L'essentiel est invisible pour les yeux.", by: 'Saint-Exupéry' },
  { text: "Ce que l'on conçoit bien s'énonce clairement.", by: 'Boileau' },
  { text: "Ce qui ne me tue pas me rend plus fort.", by: 'Nietzsche' },
  { text: "Petit à petit, l'oiseau fait son nid.", by: 'Proverbe' },
  { text: 'Connais-toi toi-même.', by: 'Temple de Delphes' },
];

const dayOfYear = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);

export const quoteOfTheDay = (d = new Date()) => QUOTES[dayOfYear(d) % QUOTES.length];
