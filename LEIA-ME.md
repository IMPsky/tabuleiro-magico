# Tabuleiro Mágico — app Android

Jogo de duelo em tabuleiro 8×8 para Android. Funciona sem internet:

- **Contas no aparelho.** Cada pessoa cria nome e senha, e a conta fica salva no celular. A primeira conta criada no aparelho é a administradora.
- **Sala por IP (Wi-Fi).** Quem cria a sala vê o IP do aparelho (ex.: `192.168.0.12`). O outro jogador digita esse IP em **Jogar → Entrar pelo IP**. Os dois precisam estar no mesmo Wi-Fi ou no hotspot de um deles.
- **Sala por Bluetooth.** Quem cria a sala escolhe **Criar sala por Bluetooth**. O outro toca em **Procurar sala por Bluetooth** e escolhe o aparelho. Se os celulares nunca foram pareados, quem criou a sala toca em **Ficar visível**.
- **Contra a IA.** Tem dois níveis, fácil e normal.
- **Status iguais para todos.** Não existe nível nem experiência: todos começam com 100 de mana e 100 de vida no núcleo. O administrador muda esses valores em **Administração → Regras e peças**.

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
| `src/base.html` | Visual, regras, tabuleiro, pergaminhos e a IA (o jogo base). |
| `src/app.js` | Contas locais, menu, salas por IP/Bluetooth, amigos, administração e sincronização do duelo. |
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

- **O código nativo ainda não foi compilado.** O `LinkPlugin.java` foi escrito sem acesso ao Android SDK. Se o Android Studio mostrar algum erro de compilação, envie a mensagem para correção.
- **Esqueci a senha.** No cadastro aparece um **código de recuperação**, e ele troca a senha. Se a pessoa perder o código, o administrador do aparelho troca a senha em **Administração → Contas**. Não há recuperação por e-mail, porque o app não usa internet.
- **Combinações de cristais.** Valem as combinações do aparelho de quem criou a sala.
- **Amigos.** Os convites de amizade são enviados durante o duelo ou na sala de espera. Cada amigo fica salvo com o último IP ou aparelho Bluetooth usado, para entrar de novo com um toque.
