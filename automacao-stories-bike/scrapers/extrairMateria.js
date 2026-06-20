const fs = require("fs");
const path = require("path");

const axios = require("axios");
const cheerio = require("cheerio");

async function extrairMateria(url) {
    const resposta = await axios.get(url, {
        headers: {
            "User-Agent": "Mozilla/5.0"
        }
    });

    const $ = cheerio.load(resposta.data);

    const titulo =
        $("h1").first().text().trim() ||
        $("meta[property='og:title']").attr("content") ||
        "";

    const imagem =
        $("meta[property='og:image']").attr("content") ||
        $("img").first().attr("src") ||
        "";

    let texto = "";

    const seletoresPossiveis = [
        "article p",
        ".article p",
        ".post p",
        ".content p",
        ".entry-content p",
        "main p",
        "p"
    ];

    for (const seletor of seletoresPossiveis) {
        let textoTemp = "";

        $(seletor).each((i, elemento) => {
            const paragrafo = $(elemento).text().trim();

            if (paragrafo.length > 40) {
                textoTemp += paragrafo + "\n\n";
            }
        });

        if (textoTemp.length > texto.length) {
            texto = textoTemp;
        }
    }

    return {
        titulo,
        texto: texto.trim(),
        imagem,
        url
    };
}

extrairMateria(
    "https://br.brujulabike.com/as-32-estreiam-na-copa-do-mundo-sobem-ao-podio-e-thomus-anuncia-uma-pre-venda-limitada/"
)
.then(resultado => {

    const arquivo = path.join(
        __dirname,
        "../data/materias.json"
    );

    fs.writeFileSync(
        arquivo,
        JSON.stringify(resultado, null, 2),
        "utf8"
    );

    console.log("Matéria salva com sucesso!");
    console.log(resultado.titulo);

})
.catch(erro => {
    console.error(erro.message);
});