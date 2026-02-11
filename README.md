# Sistema de Atendimento WebRTC com Fila - LIBRAS

Sistema de videochamadas com fila de atendimento para comunicação em tempo real entre usuários e atendentes, desenvolvido para facilitar o atendimento remoto com comunicação em LIBRAS 🤟

## � Integração com iLibras (PHP)

✨ **Novo!** Este sistema agora está totalmente integrado com o **iLibras_v1** (sistema PHP).

### 📖 Documentação de Integração

- **[QUICKSTART.md](QUICKSTART.md)** - Guia rápido de 5 minutos para testar
- **[INTEGRACAO.md](INTEGRACAO.md)** - Documentação completa da integração
- **[start.bat](start.bat)** - Script Windows para iniciar rapidamente

### 🚀 Como Usar com iLibras

1. **Inicie o servidor WebRTC:**
   ```bash
   # Windows
   start.bat
   
   # Linux/Mac
   cd server && node server.js
   ```

2. **Acesse o painel do iLibras:**
   - Faça login no administrativo
   - Vá para "Início"
   - Clique em "Ficar Online"
   - Interface do atendente aparecerá automaticamente!
### 🏗️ Arquitetura da Integração

```
┌─────────────────────────────────────────────────────────┐
│              iLibras_v1 (PHP - Frontend)                │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Painel Administrativo - Página "Início"          │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  "Buscando chamadas..."                     │  │  │
│  │  │  ┌───────────────────────────────────────┐  │  │  │
│  │  │  │   ▼ iframe WebRTC (localhost:3000)   │  │  │  │
│  │  │  │  ┌─────────────────────────────────┐  │  │  │  │
│  │  │  │  │  Interface do Atendente WebRTC  │  │  │  │  │
│  │  │  │  │  - Fila de usuários             │  │  │  │  │
│  │  │  │  │  - Aceitar chamadas             │  │  │  │  │
│  │  │  │  │  - Videochamada P2P             │  │  │  │  │
│  │  │  │  └─────────────────────────────────┘  │  │  │  │
│  │  │  └───────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                         ▲
                         │ WebSocket (ws://localhost:3000)
                         ▼
┌─────────────────────────────────────────────────────────┐
│        WebRTC Server (Node.js - Backend)                │
│  - WebSocket para sinalização                           │
│  - Sistema de fila de atendimento                       │
│  - Gerenciamento de conexões P2P                        │
│  - Distribuição para múltiplos atendentes               │
└─────────────────────────────────────────────────────────┘
                         ▲
                         │ WebRTC peer-to-peer
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Usuário (Cliente)                          │
│  http://localhost:3000/user-integrated.html             │
│  - Cadastro com nome e CPF (via URL do PHP)             │
│  - Entrada automática na fila                           │
│  - Videochamada com atendente                           │
└─────────────────────────────────────────────────────────┘
```
---

## �🎯 Funcionalidades

### Para Usuários
- Cadastro com nome e CPF
- Entrada automática na fila de atendimento
- Visualização da posição na fila em tempo real
- Notificação quando atendente aceitar a chamada
- Videochamada em tempo real com o atendente
- Controles de áudio e vídeo durante a chamada

### Para Atendentes
- Registro como atendente disponível
- Visualização em tempo real da fila de usuários aguardando
- Informações detalhadas de cada usuário (nome, CPF, tempo de espera)
- Aceitação de chamadas da fila
- Status de disponibilidade (disponível/ocupado)
- Videochamada em tempo real com o usuário
- Controles de áudio e vídeo durante a chamada

## 📋 Pré-requisitos

- Node.js (versão 14 ou superior)
- NPM ou Yarn
- Navegador moderno com suporte a WebRTC

## 🚀 Instalação

1. Clone o repositório:
```bash
git clone <repository-url>
cd WebRTC-libras
```

2. Instale as dependências do servidor:
```bash
cd server/
npm install
```

## ▶️ Como Usar

1. Inicie o servidor:
```bash
cd server/
node server.js
```

2. O servidor estará rodando em:
   - **Interface do Usuário**: http://localhost:3000/user.html
   - **Interface do Atendente**: http://localhost:3000/attendant.html
   - **Interface Antiga** (P2P direto): http://localhost:3000/index.html

### Fluxo de Atendimento

#### Como Usuário:
1. Acesse `http://localhost:3000/user.html`
2. Preencha seu nome completo e CPF
3. Clique em "Entrar na Fila de Atendimento"
4. Aguarde enquanto visualiza sua posição na fila
5. Quando um atendente aceitar, a videochamada iniciará automaticamente

#### Como Atendente:
1. Acesse `http://localhost:3000/attendant.html`
2. Digite seu nome e clique em "Entrar como Atendente"
3. Visualize a fila de usuários aguardando atendimento
4. Clique em "✓ Aceitar Chamada" no usuário desejado
5. A videochamada iniciará automaticamente

## 🌐 Acesso via Rede Local

Para acessar de outros dispositivos na mesma rede:

1. Descubra seu IP local:
   - Windows: `ipconfig`
   - Linux/Mac: `ifconfig` ou `ip addr`

2. Acesse de outros dispositivos usando:
   - Usuário: `http://SEU_IP:3000/user.html`
   - Atendente: `http://SEU_IP:3000/attendant.html`

## 📱 Acesso via Smartphone (Internet)

Para expor seu servidor local para a internet:

```bash
npm install -g ngrok
ngrok config add-authtoken YOUR_AUTH_TOKEN
ngrok http 3000
```

Depois acesse as URLs fornecidas pelo ngrok.

## 🏗️ Estrutura do Projeto

```
WebRTC-libras/
├── server/
│   ├── server.js          # Servidor WebSocket com gerenciamento de fila
│   └── package.json
├── client/
│   ├── user.html          # Interface do usuário (nova)
│   ├── user.js            # Lógica do usuário
│   ├── attendant.html     # Interface do atendente (nova)
│   ├── attendant.js       # Lógica do atendente
│   ├── index.html         # Interface antiga P2P
│   ├── app.js             # Lógica antiga
│   └── style.css          # Estilos
├── package.json
└── README.md
```

## 📡 Protocolo de Comunicação

### Mensagens do Cliente para Servidor:

- `register-user`: Registra usuário na fila com nome e CPF
- `register-attendant`: Registra atendente como disponível
- `accept-call`: Atendente aceita uma chamada específica
- `offer`: Oferta WebRTC para estabelecer conexão
- `answer`: Resposta WebRTC à oferta
- `ice-candidate`: Candidato ICE para negociação de rede
- `end-call`: Encerra uma chamada ativa

### Mensagens do Servidor para Cliente:

- `init`: Envia ID único do cliente conectado
- `queued`: Confirma entrada na fila com posição atual
- `queue-update`: Atualiza fila para todos os atendentes disponíveis
- `call-accepted`: Notifica usuário que sua chamada foi aceita
- `start-call`: Inicia processo de chamada para atendente
- `call-ended`: Notifica encerramento de chamada com motivo
- `error`: Mensagem de erro genérica

## 🔐 Segurança e Privacidade

- Comunicação peer-to-peer usando WebRTC
- Dados pessoais (CPF) formatados e validados
- Conexões WebSocket seguras (wss://) em produção
- STUN servers do Google para NAT traversal
- Sem armazenamento persistente de dados sensíveis

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js, Express, WebSocket (ws)
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **WebRTC**: RTCPeerConnection para videochamadas P2P
- **STUN Servers**: Google STUN para traversal de NAT

## 🔄 Sistema de Fila

O sistema implementa uma fila FIFO (First In, First Out) com:

- Múltiplos atendentes podem visualizar a mesma fila simultaneamente
- Apenas um atendente pode aceitar cada chamada
- Quando uma chamada é aceita, usuário é removido da fila
- Outros atendentes são notificados em tempo real da atualização
- Tempo de espera exibido e atualizado para cada usuário
- Sistema de "lock" automático para evitar conflitos

## 🐛 Troubleshooting

### Problema: Câmera/Microfone não funcionam
- Verifique as permissões do navegador (deve autorizar acesso)
- Use HTTPS em produção (obrigatório para WebRTC)
- Teste primeiro em localhost

### Problema: Não consigo me conectar
- Verifique se o servidor está rodando (`node server.js`)
- Confirme que a porta 3000 está liberada
- Verifique configurações de firewall

### Problema: Vídeo não aparece
- Teste em navegadores diferentes (Chrome e Firefox recomendados)
- Abra o console do navegador (F12) e verifique erros
- Confirme que ambos os lados aceitaram permissões de mídia

### Problema: Fila não atualiza
- Verifique a conexão WebSocket no console
- Recarregue a página do atendente
- Verifique se há erros no servidor

## 📝 Notas de Desenvolvimento

- Sistema usa IDs aleatórios únicos para identificar cada cliente
- Chamadas são totalmente peer-to-peer após conexão estabelecida
- Servidor apenas coordena a sinalização inicial (signaling)
- Suporta múltiplos atendentes online simultaneamente
- Fila é mantida em memória (considere Redis para produção em escala)
- Desconexões são tratadas automaticamente

## 🚀 Melhorias Futuras

- [ ] Persistência de histórico de atendimentos
- [ ] Sistema de autenticação para atendentes
- [ ] Gravação de sessões (com consentimento)
- [ ] Chat de texto durante a videochamada
- [ ] Estatísticas e relatórios de atendimento
- [ ] Suporte a TURN server para redes restritivas
- [ ] PWA para instalação como app

## 📄 Licença

Este projeto é de código aberto e está disponível sob a licença MIT.

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para:
- Reportar bugs
- Sugerir novas funcionalidades
- Enviar pull requests
- Melhorar a documentação

## 📧 Suporte

Para dúvidas ou problemas, abra uma issue no repositório.

---

**Desenvolvido para facilitar o atendimento remoto com comunicação em LIBRAS** 🤟
