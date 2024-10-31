import { GameArea } from '../scenes/gameArea.js';
import { Paddle } from '../scenes/paddle.js';
import { Ball } from '../scenes/ball.js';
import { setupControls } from '../scenes/controls.js';
import { Score } from '../scenes/score.js';
import { waitForKeyPress } from '../scenes/assets.js';
import { map1, map2, map3, map4 } from '../scenes/maps/VS.js';

// Déclaration de la variable pour le contrat
let tournamentContract;
let web3Initialized = false;
let historiqueTournois = JSON.parse(localStorage.getItem('historiqueTournois')) || {};

// Fonction pour charger Web3
function chargerWeb3() {
    return new Promise((resolve, reject) => {
        if (typeof window.Web3 !== 'undefined') {
            console.log('Web3 est déjà chargé.');
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = '/srcs/site/static/js/web3.min.js';
        script.onload = () => {
            if (typeof window.Web3 !== 'undefined') {
                console.log('Web3 chargé avec succès');
                resolve();
            } else {
                reject(new Error('Web3 n\'a pas pu être chargé'));
            }
        };
        script.onerror = () => {
            reject(new Error('Échec du chargement de Web3'));
        };
        document.head.appendChild(script);
    });
}

// Fonction pour initialiser Web3 et le contrat
async function initWeb3() {
    if (web3Initialized) {
        console.log('Web3 est déjà initialisé.');
        return;
    }

    if (typeof Web3 === 'undefined') {
        throw new Error('Web3 n\'a pas pu être chargé');
    }

    if (typeof window.ethereum !== 'undefined') {
        console.log('Ethereum browser detected');
        window.web3 = new Web3(window.ethereum);
        await window.ethereum.enable();
    } else {
        console.log('Connecting to local blockchain');
        window.web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'));
    }

    const tournamentContractJSON = await fetch('http://127.0.0.1:5500/srcs/requirements/truffle/build/contracts/TournamentScore.json')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        });

    const contractABI = tournamentContractJSON.abi;
    const networkId = Object.keys(tournamentContractJSON.networks)[0];
    const contractAddress = tournamentContractJSON.networks[networkId]?.address;

    if (!contractAddress) {
        throw new Error('Contract address not found. Make sure the contract is deployed to the specified network.');
    }

    tournamentContract = new web3.eth.Contract(contractABI, contractAddress);
    web3Initialized = true;
    console.log('Contrat initialisé avec succès:', tournamentContract);
}

// Fonction pour récupérer le compte utilisateur
async function getCompte() {
    const comptes = await window.web3.eth.getAccounts();
    return comptes[0];
}

// Fonction pour récupérer le nombre de tournois gagnés par les joueurs
async function afficherTournoisGagnes(joueurs) {
    try {
        const resultatsTournois = {};
        for (const joueur of joueurs) {
            const tournoisGagnes = await tournamentContract.methods.getTournamentWins(joueur).call();
            resultatsTournois[joueur] = tournoisGagnes;
        }
        return resultatsTournois;
    } catch (error) {
        console.error('Erreur lors de la récupération des tournois gagnés:', error);
    }
}

// Fonction pour récupérer l'horodatage à partir de la transaction blockchain
async function getBlockchainTimestamp(transactionReceipt) {
    const blockNumber = transactionReceipt.blockNumber;
    const block = await web3.eth.getBlock(blockNumber);
    const timestamp = block.timestamp;  // Récupérer le timestamp du bloc
    return new Date(timestamp * 1000);  // Convertir le timestamp en objet Date
}

// Fonction pour enregistrer le gagnant sur la blockchain et récupérer le timestamp de la transaction
async function enregistrerGagnantTournoi(gagnant) {
    try {
        const compte = await getCompte();
        const transactionReceipt = await tournamentContract.methods.enregistrerGagnant(gagnant)
            .send({ from: compte, gas: 500000 });
        console.log('Gagnant du tournoi enregistré avec succès');

        // Récupérer l'horodatage à partir de la transaction blockchain
        const date = await getBlockchainTimestamp(transactionReceipt);
        return date;
    } catch (error) {
        console.error('Erreur lors de l\'enregistrement du gagnant', error);
        return null;
    }
}

// Fonction pour terminer le tournoi et afficher les victoires avec l'heure et la date
async function terminerTournoi(wins) {
    const gagnant = Object.keys(wins).reduce((a, b) => (wins[a] > wins[b] ? a : b));
    console.log(`Le gagnant est : ${gagnant}`);

    // Appel pour enregistrer le gagnant sur la blockchain et récupérer la date de la transaction
    const date = await enregistrerGagnantTournoi(gagnant);

    if (date) {
        const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

        // Initialiser l'historique pour le joueur s'il n'existe pas encore
        if (!historiqueTournois[gagnant]) {
            historiqueTournois[gagnant] = [];  // Créer un tableau pour les victoires du joueur
        }

        // Ajouter la nouvelle victoire avec la date à l'historique du gagnant
        historiqueTournois[gagnant].push(dateStr);
        localStorage.setItem('historiqueTournois', JSON.stringify(historiqueTournois));  // Sauvegarder dans localStorage
    }

    // Affichage du message de fin sur le canvas
    this.score.drawTournamentEnd(gagnant);

    // Affichage du nombre de tournois gagnés par chaque joueur
    const tournoisGagnes = await afficherTournoisGagnes(this.activePlayers);

    // Mettre à jour le tableau des scores sur la page HTML (scoreboard)
    const scoreboard = document.getElementById('scoreboard');
    scoreboard.innerHTML = `<h3>Scoreboard</h3>`;

    // Pour chaque joueur, afficher les informations de score et l'historique
    for (const joueur in tournoisGagnes) {
        const playerScore = document.createElement('p');
        playerScore.textContent = `${joueur}: ${tournoisGagnes[joueur]} tournament(s) won`;
        scoreboard.appendChild(playerScore);

        // Si le joueur a un historique, afficher ses victoires avec les dates
        if (historiqueTournois[joueur] && historiqueTournois[joueur].length > 0) {
            const historique = document.createElement('ul');
            historiqueTournois[joueur].forEach((date, index) => {
                const historiqueItem = document.createElement('li');
                historiqueItem.textContent = `Tournament ${index + 1}: won the ${date}`;
                historique.appendChild(historiqueItem);
            });
            scoreboard.appendChild(historique);
        }
    }
}

// Fonction principale pour initialiser et lancer le jeu
async function main() {
    try {
        await initWeb3();
        const compte = await getCompte();
        console.log('Selected Account:', compte);
    } catch (error) {
        console.error('Erreur lors de l\'exécution de main:', error);
    }
}

// Charger Web3 et exécuter l'application
(async () => {
    try {
        await chargerWeb3();
        console.log('Web3 prêt, initialisation de l\'application');
        await main();
    } catch (error) {
        console.error('Erreur lors du chargement ou de l\'initialisation de Web3:', error);
    }
})();

////////////////////////////////////////////

export class Tournament {
    constructor(canvas, playerNames, key, ctx, font, maxScore, paddleSpeed, paddleSize, bounceMode, ballSpeed, ballAcceleration, numBalls, map) {
        this.gameArea = new GameArea(800, 600, canvas);
        this.playerNames = playerNames;
        this.key = key;
        this.ctx = ctx;
        this.font = font;
        this.isGameOver = false;
        this.balls = [];
        this.map = map;
        this.bricks = [];
        this.bricksX = 60;
        this.bricksY = 60;

        this.score = new Score(ctx, font, this.gameArea, playerNames[0], playerNames[1]);

        this.currentMatch = 0;
        this.round = 1;
        this.matches = this.createAllMatches(playerNames);
        this.wins = this.initializeWins(playerNames);
        this.activePlayers = playerNames.slice();

        this.gameTitle = "Tournament Mode";
        this.gameSubtitle = "First to ";
        this.maxScore = maxScore - 1;
        this.walls = {
            top: 'bounce',
            bottom: 'bounce',
            left: 'pass',
            right: 'pass'
        };

        if (map == 1) this.bricks = [];
        else if (map == 2) this.bricks = map1(this.gameArea, this.bricksX, this.bricksY);
        else if (map == 3) this.bricks = map2(this.gameArea, this.bricksX, this.bricksY);
        else if (map == 4) this.bricks = map3(this.gameArea, this.bricksX, this.bricksY);
        else if (map == 5) this.bricks = map4(this.gameArea, this.bricksX, this.bricksY);

        this.player1Paddle = new Paddle(this.gameArea.gameX + 10, this.gameArea.gameY + (this.gameArea.gameHeight - paddleSize) / 2, paddleSize / 10, paddleSize, 'white', paddleSpeed, 'vertical');
        this.player2Paddle = new Paddle(this.gameArea.gameX + this.gameArea.gameWidth - 20, this.gameArea.gameY + (this.gameArea.gameHeight - paddleSize) / 2, paddleSize / 10, paddleSize, 'white', paddleSpeed, 'vertical');
        this.initBalls(numBalls, ballSpeed, bounceMode, ballAcceleration);
        this.main();
    }

    initializeWins(playerNames) {
        let wins = {};
        for (let name of playerNames) {
            wins[name] = 0;
        }
        return wins;
    }

    createAllMatches(playerNames) {
        let matches = [];
        for (let i = 0; i < playerNames.length; i++) {
            for (let j = i + 1; j < playerNames.length; j++) {
                matches.push([playerNames[i], playerNames[j]]);
            }
        }
        return this.shuffle(matches); // Mélanger les matchs
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    initBalls(numBalls, ballSpeed, bounceMode, ballAcceleration) {
        const centerX = this.gameArea.gameX + this.gameArea.gameWidth / 2;
        const centerY = this.gameArea.gameY + this.gameArea.gameHeight / 2;
        const spacing = 15; // Espace entre les balles

        for (let i = 0; i < numBalls; i++) {
            const yOffset = Math.pow(-1, i) * Math.ceil(i / 2) * spacing;
            this.balls.push(new Ball(centerX, centerY + yOffset, 10, 'white', ballSpeed, bounceMode, ballAcceleration, yOffset, this.walls));
        }
    }

    main() {
        setupControls(this.key, 1, this.player1Paddle, this.player2Paddle);
        this.startMatch();
    }

    startMatch() {
        if (this.currentMatch >= this.matches.length) {
            this.setupNextRound();
            return;
        }

        if (this.map == 1) this.bricks = [];
        else if (this.map == 2) this.bricks = map1(this.gameArea, this.bricksX, this.bricksY);
        else if (this.map == 3) this.bricks = map2(this.gameArea, this.bricksX, this.bricksY);
        else if (this.map == 4) this.bricks = map3(this.gameArea, this.bricksX, this.bricksY);
        else if (this.map == 5) this.bricks = map4(this.gameArea, this.bricksX, this.bricksY);

        this.player1Paddle.resetPosition();
        this.player2Paddle.resetPosition();
        this.score.reset();
        this.isGameOver = false;
        this.score.player1Name = this.matches[this.currentMatch][0];
        this.score.player2Name = this.matches[this.currentMatch][1];
        const directions = [
            { x: 1, y: 0.5 },
            { x: 1, y: -0.5 },
            { x: -1, y: 0.5 },
            { x: -1, y: -0.5 }
        ];

        this.gameArea.clear(this.ctx);
        this.gameArea.draw(this.ctx);
        this.player1Paddle.draw(this.ctx);
        this.player2Paddle.draw(this.ctx);
        this.bricks.forEach(brick => brick.draw(this.ctx));
        this.score.drawTitle(this.gameTitle);
        this.score.drawSubtitle(this.gameSubtitle, this.maxScore + 1);
        this.score.drawScore();
        this.score.drawTournamentScore(this.wins, this.round, this.activePlayers);

        setTimeout(() => {
            this.score.drawFlat("Press any key to start.", 30, 'white', 'center', this.ctx.canvas.width / 2, this.ctx.canvas.width / 2)
            waitForKeyPress(() => {
                this.balls.forEach(ball => ball.spawn(this.gameArea, directions));
                this.loop();
            });
        }, 1000);
    }

    loop() {
        if (this.isGameOver) {
            return;
        }
        this.gameArea.clear(this.ctx);

        this.balls.forEach(ball => {
            if (ball.x < this.gameArea.gameX) {
                this.score.incrementPlayer2Score();
                const directions = [
                    { x: 1, y: 0.5 },
                    { x: 1, y: -0.5 }
                ];
                ball.spawn(this.gameArea, directions);
            } else if (ball.x + ball.size > this.gameArea.gameX + this.gameArea.gameWidth) {
                this.score.incrementPlayer1Score();
                const directions = [
                    { x: -1, y: 0.5 },
                    { x: -1, y: -0.5 }
                ];
                ball.spawn(this.gameArea, directions);
            }

            ball.move(this.gameArea, [this.player1Paddle, this.player2Paddle], this.bricks);
        });

        this.player1Paddle.move(this.gameArea);
        this.player2Paddle.move(this.gameArea);

        this.gameArea.draw(this.ctx);
        this.player1Paddle.draw(this.ctx);
        this.player2Paddle.draw(this.ctx);
        this.balls.forEach(ball => ball.draw(this.ctx));
        this.bricks.forEach(brick => brick.draw(this.ctx));
        this.game_over_screen();
        this.score.drawTitle(this.gameTitle);
        this.score.drawSubtitle(this.gameSubtitle, this.maxScore + 1);
        this.score.drawScore();
        this.score.drawTournamentScore(this.wins, this.round, this.activePlayers);
        requestAnimationFrame(this.loop.bind(this));
    }

    game_over_screen() {
        if (this.score.player1Score > this.maxScore) {
            this.isGameOver = true;
            this.score.drawEnd(1);
            setTimeout(() => {
                this.score.drawFlat("Press any key.", 20, 'white', 'center', this.ctx.canvas.width / 2, this.ctx.canvas.width / 2 + 50)
                waitForKeyPress(() => {
                    this.advanceTournament(this.score.player1Name);
                });
            }, 2000);
        }
        else if (this.score.player2Score > this.maxScore) {
            this.isGameOver = true;
            this.score.drawEnd(2);
            setTimeout(() => {
                this.score.drawFlat("Press any key.", 20, 'white', 'center', this.ctx.canvas.width / 2, this.ctx.canvas.width / 2 + 50)
                waitForKeyPress(() => {
                    this.advanceTournament(this.score.player2Name);
                });
            }, 2000);
        }
    }

    advanceTournament(winner) {
        this.wins[winner]++;
        console.log(`Enregistrement du score pour ${winner}`);

        this.currentMatch++;

        if (this.currentMatch < this.matches.length) {
            this.startMatch();
        } else {
            this.setupNextRound();
        }
    }

    setupNextRound() {
    let maxWins = Math.max(...Object.values(this.wins));
    let topPlayers = Object.keys(this.wins).filter(player => this.wins[player] === maxWins);

    if (topPlayers.length === 1) {
        this.score.drawTournamentScore(this.wins, this.round, this.activePlayers);
        this.score.drawTournamentEnd(topPlayers[0]);

        // Correction ici : appel de terminerTournoi avec .bind(this)
        terminerTournoi.bind(this)(this.wins); // Lie le contexte correct pour accéder aux méthodes de l'objet
    } else {
        this.matches = this.createAllMatches(topPlayers);
        this.currentMatch = 0;
        this.activePlayers = topPlayers;
        this.round++;

        this.startMatch();
    }
}
}
