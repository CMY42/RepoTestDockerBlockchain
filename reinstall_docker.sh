#!/bin/bash

# Redémarrer le système
#sudo reboot

# Vérifier et démarrer Docker
#sudo systemctl status docker
#sudo systemctl start docker

# Forcer la suppression des conteneurs
#sudo docker stop $(sudo docker ps -qa)
#sudo docker rm -f $(sudo docker ps -qa)
#sudo docker rmi -f $(sudo docker images -qa)
#sudo docker volume rm $(sudo docker volume ls -q)
#sudo docker network rm $(docker network ls -q) 2>/dev/null

# Vérification des permissions
#sudo usermod -aG docker $USER
#newgrp docker

# Optionnel : Réinstallation de Docker
sudo apt-get purge -y docker-ce docker-ce-cli containerd.io
sudo rm -rf /var/lib/docker /var/lib/containerd
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io

# Vérification de Docker après réinstallation
docker --version
sudo docker run hello-world
