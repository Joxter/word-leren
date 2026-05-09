export type Question = {
  question: string;
  options: string[];
  correctAnswer: string;
};

export type ListeningItem = {
  id: string;
  title: string;
  transcript: string;
  audioFile: string;
  questions: Question[];
};

export type ReadingItem = {
  id: string;
  title: string;
  transcript: string;
  questions: Question[];
};

export type KnmItem = {
  id: string;
  title: string;
  question: string;
  options: string[];
  correctAnswer: string;
};
