import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, HarmProbability } from '@google/generative-ai';
import { createClient } from "@libsql/client/web";

interface Env {
	TURSO_AUTH_TOKEN: string;
	TURSO_URL: string
}

const MODEL_NAME = 'gemini-1.5-pro-latest';
const API_KEY = '--YOUR-API-KEY-HERE--';

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

const generationConfig = {
	temperature: 0.75,
	topK: 1,
	topP: 1,
	maxOutputTokens: 512,
};

// had to set high because sometimes google has to check per tos if none
const safetySettings = [
	{
		category: HarmCategory.HARM_CATEGORY_HARASSMENT,
		threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
	},
	{
		category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
		threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
	},
	{
		category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
		threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
	},
	{
		category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
		threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
	},
];

const parts = [
	//do your pretrained responses here
	{
		text: 'Username: @user | Response: My response!',
	},
];


//Note: this at
export default {
	async fetch(req: Request, env: Env, ctx: ExecutionContext) {
		// Nightbot CA blocking
		let country = req.headers.get('cf-ipcountry');
		if (country === 'CA') {
			return new Response('Try again Nightbot went to wrong server :(', { status: 500 });
		} else {
			const params = new URLSearchParams(req.url.trim().split('/').slice(3).toString());
			try {
				const body = params.get('b');
				if (body === null) {
					return new Response('error 1 void body', { status: 500 });
				} else if (req.headers.get('User-Agent') === 'StreamElements Bot' && params.get('u') !== null) {
					//turso client that extracts memories
					const client = createClient({
						url: env.TURSO_URL,
						authToken: env.TURSO_AUTH_TOKEN
					});
					//* variables that will determine if the convo can be saved!
					//! In order: SEX | HATE | HARASSMENT | DANGEROUS_CONTENT
					let WARN_VARS = [0, 0, 0, 0];
					// username
					const userName = params.get('u');
					//userlevel
					const userLevel = parseInt(params.get('ul') as string);
					//by default is "everyone"
					let userLevelString = 'everyone';
					// Determins userlevel
					switch (userLevel) {
						case 1500:
							userLevelString = 'streamer'; 
							break;
						case 500:
							userLevelString = 'moderator';
							break;
						case 400:
							userLevelString = 'vip';
							break;
						case 250:
							userLevelString = 'subscriber';
							break;
						default:
							console.debug('[DEB] 100 as default!');
							break;
					}
					console.debug(`[DEB] Question => ${body}" `); // names debug
					console.debug(`[DEB] userName => "${userName} | userLevel => ${userLevelString}" `); // names debug
					const editedPart = [...parts,	{ text: `Username: @${userName} | ${userLevelString}: ${body}` }, { text: 'Response:' }]
					const chat = await model.generateContent({
						contents: [{ role: 'user', parts: editedPart }],
						generationConfig,
						safetySettings,
					});
					const response = chat.response.text();
					console.debug(`[DEB] Response => "${response}" `); // debug
					for (let [ind, val] of chat.response.promptFeedback!.safetyRatings.entries()) {
						console.debug(`[RATING ${ind + 1}] ${val.category} -- ${val.probability}`); //rating feedback console
						switch (val.probability) {
							case HarmProbability.HARM_PROBABILITY_UNSPECIFIED:
								WARN_VARS[ind] = 0;
								break;
							case HarmProbability.NEGLIGIBLE:
								WARN_VARS[ind] = 3;
								break;
							case HarmProbability.LOW:
								WARN_VARS[ind] = 2;
								break;
							case HarmProbability.MEDIUM:
								WARN_VARS[ind] = 1;
								break;
							case HarmProbability.HIGH:
								WARN_VARS[ind] = 0;
								break;
						}
					}
					// This determins if the convo can be archived
					const rack = WARN_VARS.reduce((num1, num2) => num1 + num2) 
					if (rack >= 10) {
						console.log('[DEB] Posible to archive => ', rack);
					}
					return new Response(response, { status: 200 });
				} else {
					return new Response('error 2 not allowed', { status: 403 });
				}
			} catch (e) {
				if (e instanceof Error) {
					console.log(e.message);
					throw new Error(e.message);
					//return new Response('error 3 internal server error', { status: 500 });
				}
			}
		}
	},
};
