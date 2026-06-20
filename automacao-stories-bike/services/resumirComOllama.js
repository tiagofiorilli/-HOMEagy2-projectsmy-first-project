const axios = require("axios");
const fs = require("fs");
const path = require("path");

async function resumir() {
    const arquivo = path.join(
        __dirname,
        "../data/materias.json"
    );

    const materia = JSON.parse(
        fs.readFileSync(arquivo, "utf8")
    );

    const prompt = `
Você é criador de conteúdo da Fiorilli Bike Shop e especialista em ciclismo, MTB e tecnologia bike.

Leia esta matéria:

Título:
${materia.titulo}

Texto:
${materia.texto}

Faça:
1 - Traduza para português do Brasil
2 - Resuma sem copiar a matéria
3 - Não escreva como se a Fiorilli tivesse criado o produto
4 - Use linguagem de ciclistas
5 - Crie uma sequência de 3 stories curtos
6 - Cada texto deve ter no máximo 18 palavras
7 - Use frases diretas, sem parágrafos longos
8 - Não use hashtags

Formato obrigatório, bem curto:

STORY_1_TITULO:
STORY_1_TEXTO:

STORY_2_TITULO:
STORY_2_TEXTO:

STORY_3_TITULO:
STORY_3_TEXTO:

PERGUNTA_FINAL:
`;

    const resposta = await axios.post(
        "http://localhost:11434/api/generate",
        {
            model: "llama3.2",
            prompt: prompt,
            stream: false
        }
    );

    const textoIA = resposta.data.response;

    console.log(textoIA);

    const arquivoStory = path.join(
        __dirname,
        "../data/story.json"
    );

    const story = {
        criadoEm: new Date(),
        conteudo: textoIA,
        imagem: materia.imagem,
        fonte: materia.url
    };

    fs.writeFileSync(
        arquivoStory,
        JSON.stringify(story, null, 2),
        "utf8"
    );

    console.log("Story salvo em data/story.json");
}

resumir();