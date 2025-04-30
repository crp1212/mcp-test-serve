export interface OpenWeatherResponse {
  main: {
    temp: number;
    humidity: number;
  };
  weather: Array<{
    description: string;
  }>;
  wind: {
    speed: number;
  };
  dt_txt?: string;
}

export interface WeatherData {
  temperature: number;
  conditions: string;
  humidity: number;
  wind_speed: number;
  timestamp: string;
}

export interface ForecastDay {
  date: string;
  temperature: number;
  conditions: string;
}

export interface GetForecastArgs {
  city: string;
  days?: number;
}
export interface GetLangKeyArgs {
  dirNames:string
  keys: string[]
}
// Type guard for forecast arguments
export function isValidForecastArgs(args: any): args is GetForecastArgs {
  return (
    typeof args === "object" && 
    args !== null && 
    "url" in args &&
    typeof args.url === "string" &&
    (args.url !== '' )
  );
}

// Type guard for forecast arguments
export function isValidLangToolsArgs(args: any): args is GetLangKeyArgs {
  return (
    typeof args === "object" && 
    args !== null && 
    "dirName" in args &&
    typeof args.dirName === "string" &&
    (args.dirName !== '' )
  );
}
