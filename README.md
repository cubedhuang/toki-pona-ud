# Universal Dependencies for Toki Pona

The goal of this project is to extend former work on [Toki Pona parsing](https://github.com/cubedhuang/ilo-nasin-sin) to output [Universal Dependencies](https://universaldependencies.org/) trees, allowing for cross-linguistic analysis between Toki Pona and other languages.

## This Repository

`/pipeline` contains some initial data processing scripts that takes [DiscordChatExporter](https://github.com/tyrrrz/discordchatexporter)'s output and filters out and tokenizes Toki Pona sentences with [sona toki](https://github.com/gregdan3/sona-toki).

`/parser` contains a modified version of the parser from [nasin.nimi.li](https://github.com/cubedhuang/ilo-nasin-sin) which better differentiates between words and phrases and (TODO) takes in tokens from [sona toki](https://github.com/gregdan3/sona-toki) as input instead of raw strings.

`/viewer` is like _nasin.nimi.li_'s parser website and also (TODO) hosts UD parse visualizations and (TODO) other stuff.
