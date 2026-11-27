# Universal Dependencies for Toki Pona

The goal of this project is to extend former work on [Toki Pona parsing](https://github.com/cubedhuang/ilo-nasin-sin) to output [Universal Dependencies](https://universaldependencies.org/) trees, allowing for cross-linguistic analysis between Toki Pona and other languages.

## This Repository

`/docs` contains the UD docs for Toki Pona based on the [template](https://github.com/UniversalDependencies/docs/blob/pages-source/_template/template-index.md) in their docs.

`/pipeline` contains some initial data processing scripts, which

- Preprocesses [DiscordChatExporter](https://github.com/tyrrrz/discordchatexporter)'s output by removing Markdown and anonymizing mentions.
- Takes openly licensed texts from a clone of [poki Lapo](https://github.com/kulupu-lapo/poki) (which, unlike the Discord data, can be redistributed in a UD treebank).
- Filters out and tokenizes Toki Pona sentences with [sona toki](https://github.com/gregdan3/sona-toki).

`/parser` contains a modified version of the parser from [nasin.nimi.li](https://github.com/cubedhuang/ilo-nasin-sin) which better differentiates between words and phrases and (TODO) takes in tokens from [sona toki](https://github.com/gregdan3/sona-toki) as input instead of raw strings.

`/viewer` is like _nasin.nimi.li_'s parser website and also (TODO) hosts UD parse visualizations and (TODO) other stuff.
