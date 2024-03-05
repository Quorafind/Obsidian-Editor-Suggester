# Obsidian custom suggester

You can modify the suggester by any word you want. You can also add a new word to the suggester.

| Example 1                          | Example 2                          |
|------------------------------------|------------------------------------|
| ![Example 1](./media/example1.gif) | ![Example 2](./media/example2.gif) |

## How to use

1. Open the settings of the plugin
2. Set your custom suggester like the trigger word you want to use, like `【` in the example.
3. Set the end word of the suggester, like `】` in the example.(You can also set it as empty).
4. The regex is used for matching the target content that used for suggesting. You can modify it to match your own
   content(Use for preventing match last trigger word).
5. Suggestion list is the list of the words you want to suggest. You can add or remove any word you want. Every line as
   a word.
6. The suggester will be triggered when you type the trigger word and the regex matches the content.

## Special

- Link type suggestions will insert file link like `[[file]]`.
- Function type suggestions will call the function you set in the settings.

```javascript
// Example
// this contains query and also app itself:
// this.params = {
// 	app: app,
// 	obsidian,
//  query: {
//    trigger: string;
//    query: string;
//  }
// };
if (this.query) {
	const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
	const nextHour = moment().add(1, 'hour').format('YYYY-MM-DD HH:mm:ss');
	const nextThreeHours = moment().add(3, 'hour').format('YYYY-MM-DD HH:mm:ss');
	const nextTwelveHours = moment().add(12, 'hour').format('YYYY-MM-DD HH:mm:ss');
	const nextDay = moment().add(1, 'day').format('YYYY-MM-DD HH:mm:ss');
	const nextWeek = moment().add(1, 'week').format('YYYY-MM-DD HH:mm:ss');
	const nextMonth = moment().add(1, 'month').format('YYYY-MM-DD HH:mm:ss');
	return [currentTime, nextHour, nextThreeHours, nextTwelveHours, nextDay, nextWeek, nextMonth];
}
```
