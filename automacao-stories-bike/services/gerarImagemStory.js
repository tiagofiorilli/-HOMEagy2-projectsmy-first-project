const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");


async function gerarStory() {

    const arquivo = path.join(
        __dirname,
        "../data/story.json"
    );

    const dados = JSON.parse(
        fs.readFileSync(arquivo, "utf8")
    );


    // tamanho Instagram Stories
    const largura = 1080;
    const altura = 1920;

    const canvas = createCanvas(largura, altura);
    const ctx = canvas.getContext("2d");


    // fundo preto
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, largura, altura);


    // imagem da matéria
    const img = await loadImage(dados.imagem);

    ctx.drawImage(
        img,
        0,
        0,
        largura,
        900
    );


    // faixa inferior
    ctx.fillStyle = "#000000";
    ctx.fillRect(
        0,
        850,
        largura,
        1070
    );


    // título
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 55px Arial";

    escreverTexto(
        ctx,
        dados.conteudo,
        70,
        1000,
        950,
        70
    );


    // fonte
    ctx.font = "35px Arial";
    ctx.fillText(
        "Fonte: Brujulabike",
        70,
        1800
    );


    ctx.fillText(
        "🚴 Fiorilli Bike Shop",
        70,
        1860
    );


    const saida = path.join(
        __dirname,
        "../output/stories/story.png"
    );


    const buffer = canvas.toBuffer("image/png");

    fs.writeFileSync(saida, buffer);


    console.log("Story criado:");
    console.log(saida);

}


// quebrar linhas automaticamente
function escreverTexto(ctx, texto, x, y, larguraMax, alturaLinha) {

    const palavras = texto.split(" ");

    let linha = "";

    for (const palavra of palavras) {

        const teste = linha + palavra + " ";

        if (ctx.measureText(teste).width > larguraMax) {

            ctx.fillText(linha, x, y);

            linha = palavra + " ";

            y += alturaLinha;

        } else {

            linha = teste;

        }
    }

    ctx.fillText(linha, x, y);
}


gerarStory();