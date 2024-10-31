// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TournamentScore {
    struct Player {
        string name;
        uint score;
    }

    Player[] public players;
    string public winner;  // Nouvelle variable pour stocker le gagnant du tournoi
    mapping(string => uint) public tournamentWins;  // Nouveau mapping pour suivre les tournois gagnés

    // Ajouter un événement pour suivre les ajouts de joueurs et du gagnant
    event PlayerAdded(string name, uint score);
    event TournamentWinner(string winner);  // Nouvel événement pour le gagnant

    function addPlayer(string memory _name) public {
        require(bytes(_name).length > 0, "Le nom ne peut pas etre vide");
        players.push(Player(_name, 0));
        emit PlayerAdded(_name, 0); // Emettre un événement après l'ajout d'un joueur
    }

    function getPlayerScore(uint _index) public view returns (string memory name, uint score) {
        require(_index < players.length, "Index hors limites");
        Player memory player = players[_index];
        return (player.name, player.score);
    }

    function getTotalPlayers() public view returns (uint) {
        return players.length;
    }

    function getAllPlayers() public view returns (Player[] memory) {
        return players;
    }

    // Fonction pour finaliser le tournoi et mettre à jour les scores des joueurs
    function finalizeTournament(string[] memory playerNames, uint[] memory scores) public {
        require(playerNames.length == scores.length, "Les tableaux doivent avoir la meme longueur");
        for (uint i = 0; i < playerNames.length; i++) {
            require(bytes(playerNames[i]).length > 0, "Le nom ne peut pas etre vide");

            // Rechercher le joueur par son nom et mettre à jour son score cumulatif
            bool found = false;
            for (uint j = 0; j < players.length; j++) {
                if (keccak256(bytes(players[j].name)) == keccak256(bytes(playerNames[i]))) {
                    players[j].score += scores[i];  // Ajouter le nouveau score à l'ancien
                    found = true;
                    break;
                }
            }

            // Si le joueur n'est pas trouvé, l'ajouter
            if (!found) {
                players.push(Player(playerNames[i], scores[i]));
                emit PlayerAdded(playerNames[i], scores[i]);
            }
        }
    }

    // Fonction pour enregistrer le gagnant du tournoi
    function enregistrerGagnant(string memory _winner) public {
        require(bytes(_winner).length > 0, "Le nom du gagnant ne peut pas etre vide");
        winner = _winner;  // Stocker le nom du gagnant
        tournamentWins[_winner]++;  // Incrémenter le nombre de tournois gagnés par le joueur
        emit TournamentWinner(_winner);  // Emettre un événement pour le gagnant
    }

    // Récupérer le gagnant du tournoi
    function getWinner() public view returns (string memory) {
        return winner;
    }

    // Récupérer le nombre de tournois gagnés par un joueur
    function getTournamentWins(string memory playerName) public view returns (uint) {
        return tournamentWins[playerName];
    }
}
