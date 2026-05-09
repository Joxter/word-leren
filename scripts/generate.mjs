import { readdir, readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

function stripHtml(html) {
  // Detach punctuation spans (class="-ml-0.5") from surrounding whitespace
  let text = html.replace(
    /\s*<span class="-ml-0\.5">([^<]*)<\/span>/g,
    "$1",
  );
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/\s+([.,!?:;)])/g, "$1");
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function cleanAnswer(answer) {
  return answer.replace(/^Correct answer:\s*/i, "").trim();
}

function processQuestions(questions) {
  return questions.map(({ question, options, correctAnswer }) => ({
    question,
    options,
    correctAnswer: cleanAnswer(correctAnswer),
  }));
}

async function processDir(dir, type) {
  const files = await readdir(dir);
  const items = [];

  for (const file of files.filter((f) => extname(f) === ".json")) {
    const id = basename(file, ".json");
    const raw = JSON.parse(await readFile(join(dir, file), "utf8"));

    if (raw.error || !raw.transcript || !raw.questions) continue;

    let item;

    if (type === "knm") {
      const q = raw.questions[0];
      item = {
        id,
        title: raw.title,
        question: stripHtml(raw.transcript),
        options: q.options,
        correctAnswer: cleanAnswer(q.correctAnswer),
      };
    } else {
      item = {
        id,
        title: raw.title,
        transcript: stripHtml(raw.transcript),
        questions: processQuestions(raw.questions),
      };
      if (type === "listening") {
        item.audioFile = `audio/${id}.mp3`;
      }
    }

    items.push(item);
  }

  items.sort((a, b) => a.title.localeCompare(b.title));
  return items;
}

async function main() {
  const dataDir = join(ROOT, "src/data");
  const audioOutDir = join(ROOT, "public/audio");

  await mkdir(dataDir, { recursive: true });
  await mkdir(audioOutDir, { recursive: true });

  const [listening, reading, knm] = await Promise.all([
    processDir(join(ROOT, "output"), "listening"),
    processDir(join(ROOT, "output-reading"), "reading"),
    processDir(join(ROOT, "output-knm"), "knm"),
  ]);

  await Promise.all([
    writeFile(
      join(dataDir, "listening.json"),
      JSON.stringify(listening, null, 2),
    ),
    writeFile(join(dataDir, "reading.json"), JSON.stringify(reading, null, 2)),
    writeFile(join(dataDir, "knm.json"), JSON.stringify(knm, null, 2)),
  ]);

  const audioSrcDir = join(ROOT, "output/audio");
  const audioFiles = (await readdir(audioSrcDir)).filter(
    (f) => extname(f) === ".mp3",
  );
  await Promise.all(
    audioFiles.map((f) =>
      copyFile(join(audioSrcDir, f), join(audioOutDir, f)),
    ),
  );

  console.log(
    `listening: ${listening.length}, reading: ${reading.length}, knm: ${knm.length}`,
  );
  console.log(`audio: ${audioFiles.length} files copied to public/audio/`);
}

main().catch(console.error);
