import logging
from django.core.management.commands.loaddata import humanize
from django.core.serializers import get_serializer
from django.db.models.expressions import result
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenBlacklistView
from rest_framework import (
    generics,
    status,
    request
)
from .serializers import (
    RegisterSerializer,
    UserProfileSerializer,
    ChangePasswordSerializer,
    UserIdSerializer,
    UserProtectedInfoSerializer,
    UserProtectedPublicInfoSerializer,
    VerifyUserLoginSerializer
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.contrib.auth.password_validation import password_changed
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from friends_app.models import FriendRequest
from game_app.views import get_user_stats
from friends_app.views import are_friends

User = get_user_model()
logger = logging.getLogger(__name__)

#-----------------------------------------------------------------------------------------------------------------------
#class MyCustomTokenBlackListView(TokenBlacklistView):
#    http_method_names = ['post']
#
#    def post(self, request, *args, **kwargs):
#        # Call the default method of TokenBlacklistView with super()
#        # The super() function is used to give access to methods and properties of a parent or sibling class.
#        # The super() function returns an object that represents the parent class.
#        response = super().post(request, *args, **kwargs)
#
#        # Vérifie si le statut est 200 (succès)
#        if response.status_code == status.HTTP_200_OK:
#            custom_response_data = {"message": "Logout successful. Token successfully blacklisted."}
#            custom_response_data.update(response.data)
#            return Response(custom_response_data, status=status.HTTP_200_OK)
#        else:
#            return response
#-----------------------------------------------------------------------------------------------------------------------

def get_user_data_auth(current_user, other_user):
    user_data = UserProtectedInfoSerializer(other_user).data
    if current_user != other_user:
        if are_friends(current_user, other_user):
           is_friend = True
        else:
            is_friend = False
        user_data.update({"is_friend": is_friend})
    return user_data

#-----------------------------------------------------------------------------------------------------------------------

class MyCustomTokenBlackListView(APIView):
    permission_classes = [IsAuthenticated]
    http_method_names = ['post']

    def post(self, request, *args, **kwargs):
        # Get the refresh token from the request data
        refresh_token = request.data.get('refresh')

        # If the refresh token is not provided, return an error message
        if not refresh_token:
            return Response({"error": "Refresh token field is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Get the user from the request and set the is_online field to False, then save the user
        try:
            current_user = request.user
            current_user.is_online = False
            current_user.save()
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Try to blacklist the refresh token
        try:
            # Creating a BlacklistMixin subclass instance
            token = RefreshToken(refresh_token)

            # Calling the instance’s blacklist method
            token.blacklist()

            return Response({"message": "Logout successful, token blacklisted."}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

#-----------------------------------------------------------------------------------------------------------------------
# RegisterView : uses RegisterViewSerializer to validates data and create a new user
# accepts HTTP requests
class RegisterView(generics.CreateAPIView):
    http_method_names = ['post']
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    queryset = User.objects.all()

#-----------------------------------------------------------------------------------------------------------------------
# UserProfileView: PUT, PATCH, GET requests because RetrieveUpdateDestroyAPIView is used
# POST is not allowed
# update is automatically done by the RetrieveUpdateAPIView
class UserProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        # Renvoie l'utilisateur connecté (self.request.user)
        return self.request.user

#-----------------------------------------------------------------------------------------------------------------------
class ChangePasswordView(generics.UpdateAPIView):
    serializer_class = ChangePasswordSerializer
    queryset = User.objects.all()
    permission_classes = [IsAuthenticated]
    http_method_names = ['post']

    def get_object(self, queryset=None):
        return self.request.user

    def update(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = self.get_serializer(data=request.data)

        if serializer.is_valid():
            # Check old password
            if not user.check_password(serializer.validated_data['old_password']):
                return Response({"old_password": ["Wrong password."]}, status=status.HTTP_400_BAD_REQUEST)

            # Set the new password
            user.set_password(serializer.validated_data['new_password'])
            user.save()

            password_changed(serializer.data.get("new_password"), user=user)
            return Response({"detail": "Password updated successfully."}, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

#-----------------------------------------------------------------------------------------------------------------------

class ShowAllUsersView(generics.ListAPIView):
    serializer_class = UserProtectedInfoSerializer
    permission_classes = [AllowAny]
    http_method_names = ['get']

    def get_queryset(self):

        # Get all users according to the user's authentication status
        if self.request.user.is_authenticated:
            all_users = User.objects.filter(is_active=True).exclude(last_login__isnull=True).exclude(is_superuser=True).exclude(id=self.request.user.id)
        else:
            all_users = User.objects.filter(is_active=True).exclude(last_login__isnull=True).exclude(is_superuser=True)

        result = []

        for user in all_users:
            if self.request.user.is_authenticated:
                user_data = get_user_data_auth(self.request.user, user)
            else:
                user_data = UserProtectedPublicInfoSerializer(user).data

            user_stats = get_user_stats(user)
            user_data.update(user_stats)
            result.append(user_data)
        return result

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        return Response(queryset)

#-----------------------------------------------------------------------------------------------------------------------
# Display user info from user id
# if the request user and the user_id are the same, return all user info except is_friend
# if the request user and the user_id are different, return all user info and is_friend
# if the request is not authenticated return all less user info
class GetUserFromIDView(APIView):
    http_method_names = ['post']
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = UserIdSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_id = serializer.validated_data['user_id']
        try:
            user = User.objects.get(id=user_id)
            if not user.last_login:
                return Response({"error": "User has never logged in."}, status=status.HTTP_400_BAD_REQUEST)
            elif not user.is_active:
                return Response({"error": "User is not active."}, status=status.HTTP_404_NOT_FOUND)

            if request.user.is_authenticated:
                user_data = get_user_data_auth(request.user, user)
                return Response(user_data, status=status.HTTP_200_OK)
            else:
                return Response(UserProtectedPublicInfoSerializer(user).data, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)
#-----------------------------------------------------------------------------------------------------------------------

class VerifyUserLoginView(APIView):
    permission_classes = [AllowAny]
    http_method_names = ['post']

    def post(self, request, *args, **kwargs):
        serializer = VerifyUserLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = User.objects.get(email=serializer.validated_data['email'])
            if not user.last_login:
                return Response({"error": "User has never logged in."}, status=status.HTTP_404_NOT_FOUND)
            elif not user.is_active:
                return Response({"error": "User is not active."}, status=status.HTTP_404_NOT_FOUND)
            elif not user.check_password(serializer.validated_data['password']):
                return Response({"error": "Incorrect password."}, status=status.HTTP_400_BAD_REQUEST)
            else:
                return Response({"message": "Login successful."}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({"error": "User not found."}, status=status.HTTP_404_NOT_FOUND)