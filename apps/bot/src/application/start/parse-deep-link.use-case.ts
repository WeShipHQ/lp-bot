import { DeepLink, DeepLinkParseError } from '../../domain/start';

export interface ParseDeepLinkRequest {
  startParam: string;
}

export interface ParseDeepLinkResponse {
  deepLink: DeepLink;
}

export class ParseDeepLinkUseCase {
  async execute(request: ParseDeepLinkRequest): Promise<ParseDeepLinkResponse> {
    try {
      const deepLink = DeepLink.parse(request.startParam);
      return { deepLink };
    } catch (error) {
      if (error instanceof DeepLinkParseError) {
        throw error;
      }
      throw new DeepLinkParseError(
        `Failed to parse deep link: ${error instanceof Error ? error.message : 'Unknown error'}`,
        request.startParam
      );
    }
  }
}