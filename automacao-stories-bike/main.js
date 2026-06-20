const { execSync } = require("child_process");

function rodar(comando) {
    console.log(`\nRodando: ${comando}\n`);
    execSync(comando, { stdio: "inherit" });
}

try {
    console.log("Iniciando automação de stories...");

    rodar("node .\\scrapers\\extrairMateria.js");
    rodar("node .\\services\\resumirComOllama.js");
    rodar("node .\\services\\gerarImagemStory.js");

    console.log("\nAutomação finalizada com sucesso!");
    console.log("Story criado em: output/stories/story.png");

} catch (erro) {
    console.error("\nErro na automação:");
    console.error(erro.message);
}