# Tabuleiro Mágico — app Android

Jogo de duelo em tabuleiro 8×8 para Android. Funciona sem internet:

- **Contas no aparelho.** Cada pessoa cria nome e senha, e a conta fica salva no celular. Se esquecer a senha, usa o código de recuperação mostrado no cadastro.
- **Arsenal.** As peças são placas de pedra. Cada duelista dá nome e imagem às placas, ao núcleo e à lápide, e distribui 40 pontos entre vida, força, distância de ataque, distância de andar e intervalo.
- **Modos 1 x 1 e 2 x 2.** No 2 x 2 jogam 4 pessoas em dois times. Quem cria a sala recebe os outros 3 celulares e repassa as jogadas para todos.
- **Séries de melhor de 3.** As combinações de cristais são sorteadas quando a sala é criada e ficam iguais até o fim da série. A página **Combinações** mostra todas as habilidades que existem.
- **Intervalos.** O intervalo das placas e a recarga dos pergaminhos só correm durante a vez do adversário.
- **Núcleo.** Pode andar quantas casas o dado Andar mandar.
- **Mana.** Cada duelista começa com 200.
- **Pergaminho de feitiço.** Aparece no centro do tabuleiro depois de 5 minutos, depois de mais 10, de mais 15 e assim por diante. Quem pisar nele ganha um efeito pronto.
- **Campo elemental.** Transforma o chão no terreno do elemento (lava, água, gelo, terra, grama, tempestade, vento, luz ou trevas), com animação, e dá +2 de dano às placas desse elemento.
- **Necromancia.** Levanta qualquer lápide (sua ou do inimigo) para lutar do seu lado, com 2 de vida, por 5 minutos.
- **Árvore da vida.** Cura 6 de vida das placas ao redor a cada 4 minutos e dura 10 minutos. A imagem fica em `src/img/arvore.png`.
- **Fusão a qualquer hora.** Os cristais podem ser combinados também na vez do adversário. Quando um pergaminho volta com um efeito ainda em recarga, a contagem regressiva aparece em cima dele.
- **Sons e efeitos.** Tem som de cristal, brilho quando uma combinação dá certo, número de dano nos ataques e a vida descendo. O nome de cada placa aparece sobre ela.
- **Informação oculta.** Cada jogador vê só a própria mana e a vida do próprio núcleo.
- **Sala por IP (Wi-Fi).** Quem cria a sala vê o IP do aparelho (ex.: `192.168.0.12`). Os outros digitam esse IP em **Jogar → Entrar pelo IP**. Todos precisam estar no mesmo Wi-Fi ou no hotspot de quem criou a sala.
- **Sala por Bluetooth.** Os outros tocam em **Procurar sala por Bluetooth** e escolhem o aparelho de quem criou a sala.
- **Contra a IA.** Só no 1 x 1, com dois níveis: fácil e normal.

## Como gerar o APK

1. Instale o **Node.js 20 ou mais novo** e o **Android Studio** (versão Ladybug ou mais nova).
2. Descompacte esta pasta e abra um terminal dentro dela. Rode:
   ```
   npm install
   npx cap sync android
   ```
3. Abra o projeto no Android Studio:
   ```
   npx cap open android
   ```
   Você também pode abrir a pasta `android` direto no Android Studio. Espere o Gradle terminar de sincronizar; na primeira vez ele baixa as dependências.
4. No Android Studio, vá em **Build → Build App Bundle(s) / APK(s) → Build APK(s)**. O APK sai em:
   `android/app/build/outputs/apk/debug/app-debug.apk`
5. Copie o APK para os celulares e instale. O Android vai pedir para permitir a instalação de fontes desconhecidas.

Outra forma de instalar: com o celular ligado no USB e a depuração USB ativada, aperte ▶ (Run) no Android Studio.

## Permissões

- **Bluetooth.** O app pede permissão na primeira vez que alguém cria ou procura uma sala por Bluetooth. No Android 11 ou mais antigo, a permissão aparece como "localização", porque é assim que o sistema chama a busca de aparelhos.
- **Wi-Fi.** Não precisa de permissão especial. A sala usa a porta **47800**.

## Como funciona por dentro

| Arquivo | O que tem |
|---|---|
| `src/consts.js` | Regras fixas, placas, efeitos e sorteio das combinações. |
| `src/core.js` | Duelo: movimento, ataque, pergaminhos, IA e desenho do tabuleiro. |
| `src/style.css`, `src/icons.svg` | Visual e ícones. |
| `src/app.js` | Contas locais, menu, Arsenal, salas por IP/Bluetooth, amigos e a série melhor de 3. |
| `src/body.html` | Telas (login, menu, duelo). |
| `build.py` | Junta tudo em `www/index.html`. |
| `android/app/src/main/java/com/rubens/tabuleiromagico/LinkPlugin.java` | Código nativo da conexão (servidor TCP e Bluetooth RFCOMM). |

Durante o duelo, quem faz a jogada envia o estado completo da partida para o outro aparelho. Se a conexão cair, a sala continua aberta no aparelho de quem a criou: o outro entra de novo pelo mesmo IP ou Bluetooth, com a mesma conta, e o duelo continua de onde parou.

## Alterar o jogo

1. Edite os arquivos em `src/`.
2. Rode:
   ```
   python3 build.py
   npx cap copy android
   ```
3. Gere o APK de novo.

**Testar no computador, sem celular.** Rode `cd www && python3 -m http.server 8000`. Depois abra duas abas, `http://localhost:8000/index.html#a` e `http://localhost:8000/index.html#b`. Cada aba funciona como um aparelho diferente, e a conexão entre elas é simulada.

## Observações

- **Esqueci a senha.** No cadastro aparece um **código de recuperação**, e ele troca a senha. Sem o código, a senha não pode ser recuperada. Não há recuperação por e-mail, porque o app não usa internet.
- **Amigos.** Os convites de amizade são enviados durante o duelo ou na sala de espera. Cada amigo fica salvo com o último IP ou aparelho Bluetooth usado, para entrar de novo com um toque.
