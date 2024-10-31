# Utiliser l'image Node.js comme base
FROM node:16.20.0

# Définir le répertoire de travail
WORKDIR /usr/src/app

# Copier les fichiers de configuration de package
COPY ./package*.json ./

# Installer Truffle dans la version souhaitée
RUN npm install -g truffle@5.11.5

# Installer les dépendances du projet
RUN npm install

# Copier tout le contenu du dossier Truffle dans le conteneur
COPY . .

# Configurer les commandes par défaut à l'intérieur du conteneur
CMD ["truffle", "migrate", "--reset", "--config", "truffle-config.js"]
